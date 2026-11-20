import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getAuthCtx, can } from "@/server/rbac";
import { checkAiRateLimit } from "@/server/ai/rate-limiter";
import { readAndValidateOcrFile, runStructuredOcr } from "@/server/ai/ocr";
import { DEFAULT_GST_RATE_BP, isValidGstRateBp, type GstRateBp } from "@/lib/regulatory";

export const maxDuration = 60;

const StockSheetOcrSchema = z.object({
  items: z.array(
    z.object({
      medicineName: z.string(),
      genericName: z.string().nullable().optional(),
      manufacturer: z.string().nullable().optional(),
      hsn: z.string().nullable().optional(),
      batchNo: z.string().nullable().optional(),
      expiryDate: z.string().nullable().optional(),
      unitsPerPack: z.number().int().min(1).default(1),
      qtyPacks: z.number().int().min(0).default(0),
      qtyLoose: z.number().int().min(0).default(0),
      ptrRupees: z.number().min(0).default(0),
      mrpRupees: z.number().min(0).default(0),
      saleRateRupees: z.number().min(0).default(0),
      gstPct: z.number().min(0).max(28).default(12),
    })
  ),
});

function normalizeExpiry(raw?: string | null): string {
  const s = (raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const my = s.match(/^(\d{1,2})[-/](\d{2,4})$/);
  if (my) {
    const m = Math.min(12, Math.max(1, parseInt(my[1], 10)));
    let y = parseInt(my[2], 10);
    if (y < 100) y += 2000;
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }
  return "";
}

export async function POST(req: Request) {
  const ctx = await getAuthCtx().catch(() => null);
  if (!ctx || !ctx.tenantId || !ctx.storeId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(ctx, "inventory.adjust")) {
    return NextResponse.json({ error: "Forbidden: inventory.adjust permission required." }, { status: 403 });
  }

  const rl = checkAiRateLimit(ctx.tenantId, ctx.userId);
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.reason || "Rate limit exceeded." }, { status: 429 });
  }

  try {
    const formData = await req.formData();
    const { bytes, mimeType } = await readAndValidateOcrFile(formData);

    const prompt = `Extract all medicine inventory / stock rows from this uploaded PDF or image (stock sheet, shelf count, or supplier invoice).
For each row return:
- medicineName (string)
- genericName, manufacturer, hsn (if visible)
- batchNo (uppercase string, or empty if not visible)
- expiryDate (YYYY-MM-DD, using last day of month if MM/YY)
- unitsPerPack (integer >= 1, default 1)
- qtyPacks (integer packs/strips/bottles)
- qtyLoose (integer loose units/tablets if any)
- ptrRupees, mrpRupees, saleRateRupees (in INR per pack)
- gstPct (0, 5, 12, 18, or 28)`;

    const extracted = await runStructuredOcr({
      bytes,
      mimeType,
      prompt,
      schema: StockSheetOcrSchema,
    });

    const [medicines, storeBatches] = await Promise.all([
      db
        .select({
          id: schema.medicines.id,
          name: schema.medicines.name,
          unitsPerPack: schema.medicines.unitsPerPack,
          gstRateBp: schema.medicines.gstRateBp,
          mrp: schema.medicines.mrp,
        })
        .from(schema.medicines)
        .where(and(eq(schema.medicines.tenantId, ctx.tenantId), eq(schema.medicines.isActive, true))),
      db
        .select({
          id: schema.batches.id,
          medicineId: schema.batches.medicineId,
          batchNo: schema.batches.batchNo,
          qtyOnHand: schema.batches.qtyOnHand,
        })
        .from(schema.batches)
        .where(and(eq(schema.batches.tenantId, ctx.tenantId), eq(schema.batches.storeId, ctx.storeId))),
    ]);

    const medMap = new Map(medicines.map((m) => [m.name.trim().toLowerCase(), m]));
    const batchLookup = new Map<string, { id: string; qtyOnHand: number }>();
    for (const b of storeBatches) {
      batchLookup.set(`${b.medicineId}:${b.batchNo.trim().toUpperCase()}`, {
        id: b.id,
        qtyOnHand: b.qtyOnHand,
      });
    }

    const rows = extracted.items.map((it, idx) => {
      const cleanName = it.medicineName.trim();
      const exact = medMap.get(cleanName.toLowerCase());
      const approx = exact
        ? undefined
        : medicines.find((m) => m.name.toLowerCase().includes(cleanName.toLowerCase()));
      const matchedMed = exact || approx || null;

      const batchNo = (it.batchNo || "").trim().toUpperCase();
      const existingBatch =
        matchedMed && batchNo
          ? batchLookup.get(`${matchedMed.id}:${batchNo}`) ?? null
          : null;

      const rawGstBp = Math.round((it.gstPct || 12) * 100);
      const gstRateBp: GstRateBp = isValidGstRateBp(rawGstBp)
        ? rawGstBp
        : matchedMed && isValidGstRateBp(matchedMed.gstRateBp)
        ? matchedMed.gstRateBp
        : DEFAULT_GST_RATE_BP;

      const mrpPaise = Math.round((it.mrpRupees || 0) * 100) || matchedMed?.mrp || 0;
      const ptrPaise = Math.round((it.ptrRupees || 0) * 100) || (mrpPaise > 0 ? Math.round(mrpPaise * 0.8) : 0);
      const saleRatePaise = Math.round((it.saleRateRupees || 0) * 100) || mrpPaise;

      return {
        rowKey: `ocr-${idx}`,
        medicineName: cleanName,
        genericName: it.genericName?.trim() || "",
        manufacturer: it.manufacturer?.trim() || "",
        hsn: it.hsn?.trim() || "",
        matchedMedicineId: matchedMed?.id ?? null,
        matchedMedicineName: matchedMed?.name ?? null,
        existingBatchId: existingBatch?.id ?? null,
        currentQtyOnHand: existingBatch?.qtyOnHand ?? 0,
        status: existingBatch
          ? ("update_batch" as const)
          : matchedMed
          ? ("new_batch" as const)
          : ("new_medicine" as const),
        batchNo: batchNo || `OCR-${idx + 1}`,
        expiryDate: normalizeExpiry(it.expiryDate),
        unitsPerPack: matchedMed?.unitsPerPack || Math.max(1, it.unitsPerPack || 1),
        qtyPacks: Math.max(0, it.qtyPacks || 0),
        qtyLoose: Math.max(0, it.qtyLoose || 0),
        ptrPaise,
        mrpPaise,
        saleRatePaise,
        gstRateBp,
      };
    });

    return NextResponse.json({ rows });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to run stock sheet OCR.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

