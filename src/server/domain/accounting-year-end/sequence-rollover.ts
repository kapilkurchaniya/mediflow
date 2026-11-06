import { db, schema, type DbOrTx } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { MAX_INVOICE_NO_LENGTH } from "@/lib/regulatory";
import type { SequenceRolloverPreview, SequenceRolloverDocType } from "./types";

export const STANDARD_DOC_TYPES: Array<{ docType: string; defaultPrefix: string }> = [
  { docType: "sale", defaultPrefix: "INV" },
  { docType: "purchase", defaultPrefix: "PO" },
  { docType: "purchase_return", defaultPrefix: "PR" },
  { docType: "sale_return", defaultPrefix: "SR" },
  { docType: "stock_transfer", defaultPrefix: "TR" },
  { docType: "journal", defaultPrefix: "JV" },
];

/** Derives standard Indian fiscal year string (YYYY-YYYY) in Asia/Kolkata timezone. */
export function getIndianFiscalYear(date: Date = new Date()): string {
  // Asia/Kolkata offset is UTC +5:30 (+330 min)
  const istOffsetMs = 330 * 60 * 1000;
  const istDate = new Date(date.getTime() + istOffsetMs);
  const year = istDate.getUTCFullYear();
  const month = istDate.getUTCMonth() + 1; // 1-indexed (1 to 12)
  return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

/** Returns the consecutive next Indian fiscal year string (YYYY-YYYY). */
export function getNextFiscalYear(currentFy: string): string {
  const parts = currentFy.split("-");
  const endYear = parseInt(parts[1] ?? "2025", 10);
  return `${endYear}-${endYear + 1}`;
}

/** Formats a document number given prefix, fiscal year, and sequence integer. */
export function formatSimulatedDocNumber(prefix: string, fiscalYear: string, seqNum: number): string {
  const numStr = seqNum.toString().padStart(6, "0");
  const fyShort = fiscalYear.slice(2, 4) + "-" + fiscalYear.slice(7, 9);
  return `${prefix}/${fyShort}/${numStr}`;
}

/**
 * Read-only diagnostic simulating sequence reset at FY rollover boundary (31 Mar -> 1 Apr IST).
 * Does NOT burn, increment, or mutate live doc_sequences.
 */
export async function getSequenceRolloverPreview(
  tenantId: string,
  storeId: string,
  specifiedClosingFy?: string,
  dbOrTx: DbOrTx = db,
): Promise<SequenceRolloverPreview> {
  const closingFy = specifiedClosingFy ?? getIndianFiscalYear();
  const nextFy = getNextFiscalYear(closingFy);

  // Fetch store record to check custom invoice prefix if configured
  const [store] = await dbOrTx
    .select()
    .from(schema.stores)
    .where(and(eq(schema.stores.tenantId, tenantId), eq(schema.stores.id, storeId)));

  // Fetch active sequence records for closing FY
  const existingSeqs = await dbOrTx
    .select()
    .from(schema.docSequences)
    .where(
      and(
        eq(schema.docSequences.tenantId, tenantId),
        eq(schema.docSequences.storeId, storeId),
        eq(schema.docSequences.fiscalYear, closingFy),
      ),
    );

  const seqMap = new Map<string, number>();
  for (const s of existingSeqs) {
    seqMap.set(s.docType, s.nextValue);
  }

  const docTypes: SequenceRolloverDocType[] = [];
  let allValid = true;

  for (const doc of STANDARD_DOC_TYPES) {
    // For sale invoice, check if store has custom bill prefix in settings
    let prefix = doc.defaultPrefix;
    if (doc.docType === "sale" && store?.invoicePrefix) {
      prefix = store.invoicePrefix;
    }

    const currentVal = seqMap.get(doc.docType) ?? 1;
    // In next FY, sequence starts at 1
    const simulatedDocNo = formatSimulatedDocNumber(prefix, nextFy, 1);
    const isValidGst = simulatedDocNo.length <= MAX_INVOICE_NO_LENGTH;
    if (!isValidGst) {
      allValid = false;
    }

    docTypes.push({
      docType: doc.docType,
      currentClosingFiscalYear: closingFy,
      currentSequenceValue: currentVal,
      nextFiscalYear: nextFy,
      simulatedFirstDocNumber: simulatedDocNo,
      length: simulatedDocNo.length,
      maxLength: MAX_INVOICE_NO_LENGTH,
      isValidGstRule46b: isValidGst,
    });
  }

  return {
    currentFiscalYear: closingFy,
    nextFiscalYear: nextFy,
    docTypes,
    allValidGstRule46b: allValid,
  };
}
