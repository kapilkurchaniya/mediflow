/**
 * src/server/domain/import/distributor-invoice.ts
 *
 * Electronic Distributor Invoice parser & purchase auto-fill engine.
 * Supports Pharmarack, Retailio, and Marg CSV / EDI bill formats.
 * Matches medicines against tenant catalog, computes landed costs,
 * and generates PurchaseItemInput[] ready for purchase invoice creation.
 */

import Papa from "papaparse";
import { and, eq, sql } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";
import { normalizeExpiryDate, normalizePaise } from "./normalize";
import { PHARMARACK_INVOICE_MAPPINGS } from "./presets/pharmarack";
import { RETAILIO_INVOICE_MAPPINGS } from "./presets/retailio";
import { MARG_MEDICINE_MAPPINGS, MARG_BATCH_MAPPINGS } from "./presets/marg";
import { isValidGstRateBp, DEFAULT_GST_RATE_BP, type GstRateBp } from "@/lib/regulatory";
import type { PurchaseItemInput } from "@/server/domain/purchases";
import type { ExtractedSupplierInfo } from "@/server/domain/import/supplier-matcher";

export type DistributorSource = "pharmarack" | "retailio" | "marg" | "generic";

export interface ParsedDistributorInvoiceItem {
  rowNo: number;
  raw: Record<string, string>;
  name: string;
  batchNo: string;
  expiryDate: string; // YYYY-MM-DD
  pack: string;
  unitsPerPack: number;
  billedQty: number;
  freeQty: number;
  ptrPaise: number; // paise, GST-exclusive rate
  mrpPaise: number; // paise
  saleRatePaise: number; // paise
  discountPct: number; // e.g. 5 for 5%
  discountBp: number; // e.g. 500 for 5%
  gstRateBp: GstRateBp; // 0, 500, 1200, 1800, 2800
  hsn: string;
  barcode: string | null;
  effectiveUnitCostPaise: number; // landed cost per pack after free qty & discount

  // Medicine catalog matching
  matchedMedicineId: string | null;
  matchType: "exact_barcode" | "exact_name_pack" | "exact_name" | "unmatched";
  matchConfidence: number;
  matchedMedicineName?: string;

  errors: string[];
}

export interface ParseDistributorInvoiceResult {
  detectedSource: DistributorSource;
  confidence: number;
  totalLines: number;
  validLines: number;
  unmatchedMedicinesCount: number;
  totalInvoiceAmountPaise: number;
  items: ParsedDistributorInvoiceItem[];
  purchaseItems: PurchaseItemInput[];
  header?: {
    invoiceNo?: string;
    invoiceDate?: string;
  };
  extractedSupplier?: ExtractedSupplierInfo;
}

/**
 * Builds header mapping from dictionary against actual CSV headers.
 */
function matchHeadersToDictionary(
  headers: string[],
  dictionary: Record<string, string[]>
): { mapping: Record<string, string>; score: number } {
  const mapping: Record<string, string> = {};
  let score = 0;

  const headerNormalizedMap = new Map<string, string>();
  for (const h of headers) {
    headerNormalizedMap.set(h.trim().toUpperCase(), h);
  }

  for (const [targetField, synonyms] of Object.entries(dictionary)) {
    for (const syn of synonyms) {
      const synNorm = syn.trim().toUpperCase();
      const actualHeader = headerNormalizedMap.get(synNorm);
      if (actualHeader && !mapping[actualHeader]) {
        mapping[actualHeader] = targetField;
        score++;
        break;
      }
    }
  }

  return { mapping, score };
}

/**
 * Detects the distributor source and produces the column mapping.
 */
export function detectDistributorFormat(headers: string[]): {
  source: DistributorSource;
  confidence: number;
  mapping: Record<string, string>;
} {
  const pharmarack = matchHeadersToDictionary(headers, PHARMARACK_INVOICE_MAPPINGS);
  const retailio = matchHeadersToDictionary(headers, RETAILIO_INVOICE_MAPPINGS);

  const margCombinedDict: Record<string, string[]> = {
    ...MARG_MEDICINE_MAPPINGS,
    ...MARG_BATCH_MAPPINGS,
    billedQty: ["CLOSING", "QTY", "QUANTITY"],
    rate: ["PUR.RATE", "RATE", "PURCHASE RATE", "PUR_RATE"],
  };
  const marg = matchHeadersToDictionary(headers, margCombinedDict);

  // Distinctive format signatures
  const upperHeaders = headers.map((h) => h.trim().toUpperCase());
  let pScore = pharmarack.score;
  let rScore = retailio.score;
  let mScore = marg.score;

  // Pharmarack signatures
  if (upperHeaders.includes("PTR")) pScore += 2;
  if (upperHeaders.includes("DISC %") || upperHeaders.includes("SCHEME %")) pScore += 1;
  if (upperHeaders.includes("GST %")) pScore += 1;

  // Retailio signatures
  if (upperHeaders.includes("PURCHASE RATE") || upperHeaders.includes("PURCHASE_PRICE")) rScore += 2;
  if (upperHeaders.includes("ITEM DESCRIPTION")) rScore += 2;
  if (upperHeaders.includes("DISCOUNT %")) rScore += 1;
  if (upperHeaders.includes("TAX %")) rScore += 1;

  // Marg signatures
  if (upperHeaders.includes("PUR.RATE")) mScore += 3;
  if (upperHeaders.includes("CLOSING")) mScore += 2;

  let bestSource: DistributorSource = "pharmarack";
  let bestScore = pScore;
  let bestMapping = pharmarack.mapping;

  if (rScore > bestScore) {
    bestSource = "retailio";
    bestScore = rScore;
    bestMapping = retailio.mapping;
  }
  if (mScore > bestScore) {
    bestSource = "marg";
    bestScore = mScore;
    bestMapping = marg.mapping;
  }

  if (bestScore === 0) {
    bestSource = "generic";
  }

  const confidence = headers.length > 0 ? Math.min(1, Number((bestScore / (headers.length || 7)).toFixed(2))) : 0;
  return {
    source: bestSource,
    confidence: Math.max(0.7, confidence),
    mapping: bestMapping,
  };
}

/**
 * Extracts packaging unit count from strings like "10'S", "15 TAB", "200ML", "1x10".
 */
export function parseUnitsPerPack(packStr: string): number {
  if (!packStr) return 1;
  const cleaned = packStr.trim();

  // If liquid/ointment/syrup volume or weight (e.g. 200ML, 100ML, 20GM, 15GM), each pack is 1 unit
  if (/(?:ml|gm|mg|kg|ltr|g|oz|md)\b/i.test(cleaned)) {
    return 1;
  }

  // Pattern: "1x10" or "10x10" -> take second number
  const multiMatch = cleaned.match(/(\d+)\s*[xX*]\s*(\d+)/);
  if (multiMatch) {
    const val = parseInt(multiMatch[2], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  // Pattern: "15'S", "10 TAB", "10S", "10 CAP"
  const singleMatch = cleaned.match(/^(\d+)/);
  if (singleMatch) {
    const val = parseInt(singleMatch[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }

  return 1;
}

/**
 * Normalizes GST percentage to valid regulatory basis points.
 */
export function normalizeGstRateBp(rawGst: unknown): GstRateBp {
  if (rawGst === null || rawGst === undefined || rawGst === "") {
    return DEFAULT_GST_RATE_BP;
  }
  let num = typeof rawGst === "number" ? rawGst : parseFloat(String(rawGst).replace(/[^0-9.]/g, ""));
  if (isNaN(num)) return DEFAULT_GST_RATE_BP;

  // If already in basis points (e.g. 500, 1200)
  if (num >= 100) {
    if (isValidGstRateBp(num)) return num as GstRateBp;
    num = num / 100;
  }

  const bp = Math.round(num * 100);
  if (isValidGstRateBp(bp)) return bp as GstRateBp;

  // Nearest fallback
  if (bp <= 250) return 0;
  if (bp <= 850) return 500;
  if (bp <= 1500) return 1200;
  if (bp <= 2300) return 1800;
  return 2800;
}

/**
 * Parses distributor invoice CSV text and maps it into structured invoice items.
 */
export async function parseDistributorInvoice(
  csvContent: string,
  options?: {
    db?: DbOrTx;
    tenantId?: string;
  }
): Promise<ParseDistributorInvoiceResult> {
  const parsed = Papa.parse<Record<string, string>>(csvContent.trim(), {
    header: true,
    skipEmptyLines: "greedy",
  });

  const headers = parsed.meta.fields || [];
  const { source, confidence, mapping } = detectDistributorFormat(headers);

  const items: ParsedDistributorInvoiceItem[] = [];
  const purchaseItems: PurchaseItemInput[] = [];
  let totalInvoiceAmountPaise = 0;
  let validLines = 0;
  let unmatchedMedicinesCount = 0;

  let extractedInvoiceNo = "";
  let extractedInvoiceDate = "";
  const extractedSupplier: ExtractedSupplierInfo = {};

  const pickMetaVal = (row: Record<string, string>, candidates: string[]): string => {
    for (const [k, v] of Object.entries(row)) {
      const cleanK = k.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      if (candidates.includes(cleanK) && v !== undefined && String(v).trim()) {
        return String(v).trim();
      }
    }
    return "";
  };

  for (const row of parsed.data) {
    if (!extractedInvoiceNo) {
      extractedInvoiceNo = pickMetaVal(row, ["INVOICE NO", "INV NO", "BILL NO", "INVOICE NUMBER", "BILL NUMBER", "SUPPLIER INVOICE NO", "DOC NO"]);
    }
    if (!extractedInvoiceDate) {
      const rawDate = pickMetaVal(row, ["INVOICE DATE", "INV DATE", "BILL DATE", "DATE", "DOC DATE"]);
      if (rawDate) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
          extractedInvoiceDate = rawDate;
        } else {
          const dmy = rawDate.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
          if (dmy) {
            const d = parseInt(dmy[1], 10);
            const m = parseInt(dmy[2], 10);
            let y = parseInt(dmy[3], 10);
            if (y < 100) y += 2000;
            if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
              extractedInvoiceDate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            }
          }
        }
      }
    }
    if (!extractedSupplier.name) {
      const sName = pickMetaVal(row, ["SUPPLIER", "SUPPLIER NAME", "DISTRIBUTOR", "DISTRIBUTOR NAME", "PARTY", "PARTY NAME", "VENDOR", "VENDOR NAME", "SELLER NAME"]);
      if (sName) extractedSupplier.name = sName;
    }
    if (!extractedSupplier.gstin) {
      const sGstin = pickMetaVal(row, ["SUPPLIER GSTIN", "PARTY GSTIN", "GSTIN", "GST NO", "GSTIN NO"]);
      if (sGstin) extractedSupplier.gstin = sGstin.toUpperCase();
    }
    if (!extractedSupplier.phone) {
      const sPhone = pickMetaVal(row, ["SUPPLIER PHONE", "PHONE", "MOBILE", "CONTACT NO"]);
      if (sPhone) extractedSupplier.phone = sPhone;
    }
    if (!extractedSupplier.drugLicenseNo) {
      const sDl = pickMetaVal(row, ["SUPPLIER DL", "DL NO", "DRUG LICENSE", "DRUG LICENCE", "DRUG LICENSE NO"]);
      if (sDl) extractedSupplier.drugLicenseNo = sDl.toUpperCase();
    }
    if (!extractedSupplier.address) {
      const sAddr = pickMetaVal(row, ["SUPPLIER ADDRESS", "PARTY ADDRESS", "ADDRESS"]);
      if (sAddr) extractedSupplier.address = sAddr;
    }
    if (extractedInvoiceNo && extractedInvoiceDate && extractedSupplier.name) break;
  }

  // Inverted mapping: targetField -> csvHeader
  const targetToCsv: Record<string, string> = {};
  for (const [csvCol, target] of Object.entries(mapping)) {
    targetToCsv[target] = csvCol;
  }

  // Pre-fetch medicine catalogue if DB provided
  const db = options?.db;
  const tenantId = options?.tenantId;
  const existingMedicinesMap = new Map<string, { id: string; name: string; packSize?: string | null }>();
  const barcodeMap = new Map<string, { id: string; name: string }>();

  if (db && tenantId) {
    const meds = await db
      .select({
        id: schema.medicines.id,
        name: schema.medicines.name,
        packSize: schema.medicines.packSize,
        barcode: schema.medicines.barcode,
      })
      .from(schema.medicines)
      .where(eq(schema.medicines.tenantId, tenantId));

    for (const m of meds) {
      existingMedicinesMap.set(m.name.trim().toLowerCase(), m);
      if (m.barcode) barcodeMap.set(m.barcode.trim(), m);
    }
  }

  for (let idx = 0; idx < parsed.data.length; idx++) {
    const raw = parsed.data[idx];
    const rowNo = idx + 1;
    const errors: string[] = [];

    const getVal = (targetField: string): string => {
      const csvCol = targetToCsv[targetField];
      if (csvCol && raw[csvCol] !== undefined) return String(raw[csvCol]).trim();
      // Direct lookup fallback
      for (const [k, v] of Object.entries(raw)) {
        if (k.trim().toUpperCase() === targetField.toUpperCase()) return String(v).trim();
      }
      return "";
    };

    const name = getVal("name");
    if (!name) {
      errors.push("Missing product name");
    }

    const batchNo = getVal("batchNo") || `BATCH-${rowNo}`;

    // Expiry date
    const rawExpiry = getVal("expiryDate");
    const expResult = normalizeExpiryDate(rawExpiry);
    let expiryDate = "2027-12-31";
    if (expResult.success && expResult.date) {
      expiryDate = expResult.date;
    } else if (rawExpiry) {
      errors.push(`Invalid expiry format: ${rawExpiry}`);
    }

    // Packaging & units per pack
    const pack = getVal("packaging") || "10'S";
    const unitsPerPack = parseUnitsPerPack(pack);

    // Billed and Free quantities
    let billedQty = parseInt(getVal("billedQty"), 10);
    if (isNaN(billedQty) || billedQty <= 0) {
      billedQty = 1;
      errors.push("Invalid or non-positive billed quantity");
    }

    let freeQty = parseInt(getVal("freeQty"), 10);
    if (isNaN(freeQty) || freeQty < 0) {
      // Check if scheme has "10+1" or similar
      const rawDisc = getVal("discountPct");
      const schemeMatch = rawDisc.match(/(\d+)\+(\d+)/);
      if (schemeMatch) {
        freeQty = parseInt(schemeMatch[2], 10);
      } else {
        freeQty = 0;
      }
    }

    // Rates in paise
    const ptrResult = normalizePaise(getVal("rate"));
    const ptrPaise = ptrResult.success && ptrResult.paise ? ptrResult.paise : 0;
    if (ptrPaise <= 0) {
      errors.push("PTR rate must be greater than zero");
    }

    const mrpResult = normalizePaise(getVal("mrp"));
    let mrpPaise = mrpResult.success && mrpResult.paise ? mrpResult.paise : 0;
    if (mrpPaise <= 0) {
      mrpPaise = Math.round(ptrPaise * 1.3);
    }

    const saleRatePaise = Math.round(ptrPaise * 1.25);

    // Discount percentage & basis points
    let discountPct = parseFloat(getVal("discountPct").replace(/[^0-9.]/g, ""));
    if (isNaN(discountPct) || discountPct < 0) discountPct = 0;
    const discountBp = Math.min(10000, Math.round(discountPct * 100));

    // GST
    const gstRateBp = normalizeGstRateBp(getVal("gstPct"));
    const hsn = getVal("hsn") || "300490";
    const barcode = getVal("barcode") || null;

    // Landed cost per pack calculation:
    // (billedQty * ptr * (1 - disc% / 100)) / (billedQty + freeQty)
    const lineDiscountMultiplier = 1 - discountBp / 10000;
    const lineTotalTaxablePaise = Math.round(billedQty * ptrPaise * lineDiscountMultiplier);
    const totalPhysicalPacks = billedQty + freeQty;
    const effectiveUnitCostPaise =
      totalPhysicalPacks > 0 ? Math.round(lineTotalTaxablePaise / totalPhysicalPacks) : ptrPaise;

    totalInvoiceAmountPaise += lineTotalTaxablePaise;

    // Medicine matching
    let matchedMedicineId: string | null = null;
    let matchType: "exact_barcode" | "exact_name_pack" | "exact_name" | "unmatched" = "unmatched";
    let matchConfidence = 0;
    let matchedMedicineName: string | undefined = undefined;

    if (barcode && barcodeMap.has(barcode)) {
      const match = barcodeMap.get(barcode)!;
      matchedMedicineId = match.id;
      matchType = "exact_barcode";
      matchConfidence = 1.0;
      matchedMedicineName = match.name;
    } else if (existingMedicinesMap.has(name.trim().toLowerCase())) {
      const match = existingMedicinesMap.get(name.trim().toLowerCase())!;
      matchedMedicineId = match.id;
      matchType =
        match.packSize && match.packSize.toLowerCase() === pack.toLowerCase()
          ? "exact_name_pack"
          : "exact_name";
      matchConfidence = matchType === "exact_name_pack" ? 0.95 : 0.9;
      matchedMedicineName = match.name;
    } else {
      unmatchedMedicinesCount++;
    }

    const item: ParsedDistributorInvoiceItem = {
      rowNo,
      raw,
      name,
      batchNo,
      expiryDate,
      pack,
      unitsPerPack,
      billedQty,
      freeQty,
      ptrPaise,
      mrpPaise,
      saleRatePaise,
      discountPct,
      discountBp,
      gstRateBp,
      hsn,
      barcode,
      effectiveUnitCostPaise,
      matchedMedicineId,
      matchType,
      matchConfidence,
      matchedMedicineName,
      errors,
    };

    items.push(item);

    if (errors.length === 0) {
      validLines++;
      if (matchedMedicineId) {
        purchaseItems.push({
          medicineId: matchedMedicineId,
          batchNo,
          expiryDate,
          qty: billedQty,
          freeQty,
          rate: ptrPaise,
          mrp: mrpPaise,
          saleRate: saleRatePaise,
          discountBp,
          tradeDiscountBp: discountBp,
          cashDiscountBp: 0,
          unitsPerPack,
          packUnit: "strip",
          looseUnit: "tablet",
          gstRateBp,
        });
      }
    }
  }

  const hasSupplierInfo = Boolean(
    extractedSupplier.name ||
      extractedSupplier.gstin ||
      extractedSupplier.phone ||
      extractedSupplier.drugLicenseNo
  );

  return {
    detectedSource: source,
    confidence,
    totalLines: items.length,
    validLines,
    unmatchedMedicinesCount,
    totalInvoiceAmountPaise,
    items,
    purchaseItems,
    header:
      extractedInvoiceNo || extractedInvoiceDate
        ? {
            invoiceNo: extractedInvoiceNo || undefined,
            invoiceDate: extractedInvoiceDate || undefined,
          }
        : undefined,
    extractedSupplier: hasSupplierInfo ? extractedSupplier : undefined,
  };
}

/**
 * Creates minimal medicine records in the catalog for unmatched invoice items.
 * Allows instant one-click onboarding and purchase entry.
 */
export async function quickCreateDistributorMedicines(
  db: DbOrTx,
  tenantId: string,
  itemsToCreate: {
    name: string;
    pack?: string;
    unitsPerPack?: number;
    hsn?: string;
    gstRateBp?: GstRateBp;
    mrpPaise?: number;
    ptrPaise?: number;
    barcode?: string | null;
  }[]
): Promise<Map<string, string>> {
  const createdMap = new Map<string, string>(); // name.toLowerCase() -> medicineId

  for (const item of itemsToCreate) {
    const key = item.name.trim().toLowerCase();
    if (createdMap.has(key)) continue;

    // Check if created in a previous iteration
    const [existing] = await db
      .select({ id: schema.medicines.id })
      .from(schema.medicines)
      .where(
        and(
          eq(schema.medicines.tenantId, tenantId),
          sql`lower(${schema.medicines.name}) = lower(${item.name.trim()})`
        )
      )
      .limit(1);

    if (existing) {
      createdMap.set(key, existing.id);
      continue;
    }

    const unitsPerPack = item.unitsPerPack ?? parseUnitsPerPack(item.pack || "10'S");
    const mrp = item.mrpPaise ?? 10000;
    const purchasePrice = item.ptrPaise ?? Math.round(mrp * 0.7);
    const salePrice = Math.round(purchasePrice * 1.25);

    const [newMed] = await db
      .insert(schema.medicines)
      .values({
        tenantId,
        name: item.name.trim(),
        packSize: item.pack || `${unitsPerPack}'s`,
        unitsPerPack,
        packUnit: "strip",
        looseUnit: "tablet",
        hsn: item.hsn || "300490",
        gstRateBp: item.gstRateBp ?? DEFAULT_GST_RATE_BP,
        mrp,
        purchasePrice,
        salePrice,
        schedule: "none",
        barcode: item.barcode || null,
        isActive: true,
      })
      .returning({ id: schema.medicines.id });

    createdMap.set(key, newMed.id);
  }

  return createdMap;
}
