import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getAuthCtx, can } from "@/server/rbac";
import { checkAiRateLimit } from "@/server/ai/rate-limiter";
import { readAndValidateOcrFile, runStructuredOcr } from "@/server/ai/ocr";
import { evaluateGrnSupplierMatch } from "@/server/domain/import/supplier-matcher";
import { normalizeExpiryDate } from "@/server/domain/import/normalize";
import type {
  ParseDistributorInvoiceResult,
  ParsedDistributorInvoiceItem,
} from "@/server/domain/import/distributor-invoice";
import type { PurchaseItemInput } from "@/server/domain/purchases";
import { DEFAULT_GST_RATE_BP, isValidGstRateBp, type GstRateBp } from "@/lib/regulatory";
import { parsePackaging, resolveOcrCatalogPackConflict } from "@/lib/packaging";
import { normalizeDrugSchedule } from "@/lib/schedule";

export const maxDuration = 60;

const GrnOcrSchema = z.object({
  supplierName: z.string().nullable().optional(),
  supplierGstin: z.string().nullable().optional(),
  supplierPhone: z.string().nullable().optional(),
  supplierDrugLicense: z.string().nullable().optional(),
  supplierAddress: z.string().nullable().optional(),
  invoiceNo: z.string().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  items: z.array(
    z.object({
      name: z.string(),
      batchNo: z.string().nullable().optional(),
      expiryDate: z.string().nullable().optional(),
      pack: z.string().nullable().optional(),
      dosageForm: z
        .enum(["tablet", "capsule", "syrup", "cream", "injection", "drops", "sachet", "other"])
        .nullable()
        .optional(),
      unitsPerPack: z.number().int().min(1).default(1),
      billedQty: z.number().int().min(0).default(1),
      freeQty: z.number().int().min(0).default(0),
      rateRupees: z.number().min(0).default(0),
      mrpRupees: z.number().min(0).default(0),
      discountPct: z.number().min(0).max(100).default(0),
      gstPct: z.number().min(0).max(28).default(12),
      hsn: z.string().nullable().optional(),
      barcode: z.string().nullable().optional(),
      schedule: z.string().nullable().optional(),
    })
  ),
});

function normalizeExpiry(raw?: string | null): string {
  const res = normalizeExpiryDate(raw);
  return res.success && res.date ? res.date : "";
}

function normalizeInvoiceDate(raw?: string | null): string {
  const s = (raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    let y = parseInt(dmy[3], 10);
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return "";
}

export async function POST(req: Request) {
  const ctx = await getAuthCtx().catch(() => null);
  if (!ctx || !ctx.tenantId || !ctx.storeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(ctx, "purchase.create")) {
    return NextResponse.json({ error: "Forbidden: purchase.create permission required." }, { status: 403 });
  }

  const rl = checkAiRateLimit(ctx.tenantId, ctx.userId, Date.now(), {
    burstMax: 60,
    hourlyMax: 240,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.reason || "Rate limit exceeded." }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const selectedSupplierId = (formData.get("selectedSupplierId") as string) || null;
    const { bytes, mimeType } = await readAndValidateOcrFile(formData);

    const prompt = `Extract the distributor/wholesaler GST purchase invoice header and all medicine line items from this Indian pharmacy supplier bill.
Rules:
- supplierName: the distributor / seller company name at the top of the bill (NOT the buyer pharmacy name).
- supplierGstin: 15-character GSTIN of the supplier if visible.
- supplierPhone: supplier phone/mobile number if visible.
- supplierDrugLicense: supplier drug licence number (DL No / Form 20B/21B) if visible.
- supplierAddress: supplier street/city address if visible.
- invoiceNo: supplier invoice / bill number if visible.
- invoiceDate: format as YYYY-MM-DD if visible.
- For each line item: extract medicine name, batch number (uppercase), expiryDate (YYYY-MM-DD, using last day of month if MM/YY or exact date if DD MMM YY), pack (e.g. "10'S", "1x15", "100ML"), dosageForm ("tablet", "capsule", "syrup", "cream", "injection", "drops", "sachet", or "other"), unitsPerPack (integer tablets/capsules per strip e.g. 10 or 15; ALWAYS 1 for syrups, creams, drops, vials, injections), billedQty (packs), freeQty, rateRupees (PTR per pack in INR), mrpRupees (MRP per pack in INR), discountPct, gstPct (0, 5, 12, 18, or 28), hsn, schedule (Indian drug schedule from SCH column e.g. "H", "H1", "X", "G", "G & H", or null if omitted), and barcode if printed.`;

    const extracted = await runStructuredOcr({
      bytes,
      mimeType,
      prompt,
      schema: GrnOcrSchema,
    });

    const [suppliers, medicines] = await Promise.all([
      db
        .select({
          id: schema.suppliers.id,
          name: schema.suppliers.name,
          gstin: schema.suppliers.gstin,
          phone: schema.suppliers.phone,
          drugLicenseNo: schema.suppliers.drugLicenseNo,
        })
        .from(schema.suppliers)
        .where(and(eq(schema.suppliers.tenantId, ctx.tenantId), eq(schema.suppliers.isActive, true))),
      db
        .select({
          id: schema.medicines.id,
          name: schema.medicines.name,
          barcode: schema.medicines.barcode,
          gstRateBp: schema.medicines.gstRateBp,
          unitsPerPack: schema.medicines.unitsPerPack,
          packUnit: schema.medicines.packUnit,
          looseUnit: schema.medicines.looseUnit,
        })
        .from(schema.medicines)
        .where(and(eq(schema.medicines.tenantId, ctx.tenantId), eq(schema.medicines.isActive, true))),
    ]);

    const supplierCheck = evaluateGrnSupplierMatch({
      selectedSupplierId,
      suppliers,
      extracted: {
        name: extracted.supplierName,
        gstin: extracted.supplierGstin,
        phone: extracted.supplierPhone,
        drugLicenseNo: extracted.supplierDrugLicense,
        address: extracted.supplierAddress,
      },
    });

    const barcodeMap = new Map<string, (typeof medicines)[number]>();
    const nameMap = new Map<string, (typeof medicines)[number]>();
    for (const m of medicines) {
      if (m.barcode) barcodeMap.set(m.barcode.trim().toLowerCase(), m);
      nameMap.set(m.name.trim().toLowerCase(), m);
    }

    const mappedItems: ParsedDistributorInvoiceItem[] = [];
    const purchaseItems: PurchaseItemInput[] = [];
    let totalInvoiceAmountPaise = 0;

    extracted.items.forEach((it, idx) => {
      const cleanName = it.name.trim();
      const byBarcode = it.barcode ? barcodeMap.get(it.barcode.trim().toLowerCase()) : undefined;
      const byExactName = nameMap.get(cleanName.toLowerCase());
      const byPrefix =
        byBarcode || byExactName
          ? undefined
          : medicines.find((m) => m.name.toLowerCase().includes(cleanName.toLowerCase()));
      const matched = byBarcode || byExactName || byPrefix;

      const rawGstBp = Math.round((it.gstPct || 12) * 100);
      const gstRateBp: GstRateBp = isValidGstRateBp(rawGstBp)
        ? rawGstBp
        : matched && isValidGstRateBp(matched.gstRateBp)
        ? matched.gstRateBp
        : DEFAULT_GST_RATE_BP;

      const batchNo = (it.batchNo || "").trim().toUpperCase();
      const expiryDate = normalizeExpiry(it.expiryDate);
      const billedQty = Math.max(1, it.billedQty || 1);
      const freeQty = Math.max(0, it.freeQty || 0);
      const ptrPaise = Math.round((it.rateRupees || 0) * 100);
      const mrpPaise = Math.round((it.mrpRupees || 0) * 100);
      const discountPct = Math.max(0, Math.min(100, it.discountPct || 0));
      const discountBp = Math.round(discountPct * 100);
      const parsedPack = parsePackaging({
        packRaw: it.pack || (it.unitsPerPack > 1 ? String(it.unitsPerPack) : ""),
        medicineName: cleanName,
        dosageForm: it.dosageForm,
      });
      const packResolution = resolveOcrCatalogPackConflict(
        matched?.unitsPerPack ?? null,
        parsedPack.unitsPerPack
      );
      const unitsPerPack = packResolution.effectiveUpp;
      const totalPacks = billedQty + freeQty;
      const netLine = Math.round(billedQty * ptrPaise * (1 - discountPct / 100));
      const effectiveUnitCostPaise = totalPacks > 0 ? Math.round(netLine / totalPacks) : ptrPaise;
      totalInvoiceAmountPaise += netLine;

      const errors: string[] = [];
      if (!cleanName) errors.push("Missing medicine name");
      if (!batchNo) errors.push("Missing batch number");
      if (!expiryDate) errors.push("Missing expiry date");

      const itemObj: ParsedDistributorInvoiceItem = {
        rowNo: idx + 1,
        raw: {},
        name: cleanName,
        batchNo,
        expiryDate,
        pack: it.pack || `${unitsPerPack}U`,
        unitsPerPack,
        billedQty,
        freeQty,
        ptrPaise,
        mrpPaise,
        saleRatePaise: mrpPaise || ptrPaise,
        discountPct,
        discountBp,
        gstRateBp,
        hsn: it.hsn || "",
        barcode: it.barcode || null,
        schedule: normalizeDrugSchedule(it.schedule),
        effectiveUnitCostPaise,
        matchedMedicineId: matched?.id ?? null,
        matchType: byBarcode ? "exact_barcode" : byExactName || byPrefix ? "exact_name" : "unmatched",
        matchConfidence: byBarcode ? 1 : byExactName ? 0.95 : byPrefix ? 0.8 : 0,
        matchedMedicineName: matched?.name,
        errors,
      };
      mappedItems.push(itemObj);

      if (matched && errors.length === 0) {
        purchaseItems.push({
          medicineId: matched.id,
          batchNo,
          expiryDate,
          qty: billedQty,
          freeQty,
          rate: ptrPaise,
          mrp: mrpPaise,
          saleRate: mrpPaise || ptrPaise,
          discountBp,
          tradeDiscountBp: discountBp,
          cashDiscountBp: 0,
          unitsPerPack,
          packUnit: matched.packUnit || "strip",
          looseUnit: matched.looseUnit || "tablet",
          gstRateBp,
        });
      }
    });

    const parseResult: ParseDistributorInvoiceResult = {
      detectedSource: "generic",
      confidence: 0.9,
      totalLines: mappedItems.length,
      validLines: mappedItems.filter((i) => i.errors.length === 0).length,
      unmatchedMedicinesCount: mappedItems.filter((i) => !i.matchedMedicineId).length,
      totalInvoiceAmountPaise,
      items: mappedItems,
      purchaseItems,
    };

    return NextResponse.json({
      header: {
        invoiceNo: extracted.invoiceNo?.trim() || "",
        invoiceDate: normalizeInvoiceDate(extracted.invoiceDate),
      },
      supplierCheck,
      parseResult,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to run GRN invoice OCR.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
