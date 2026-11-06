/**
 * src/server/domain/gst-reconciliation/parser.ts
 *
 * Robust parser for official GSTN GSTR-2B JSON and tabular structures.
 * Converts GSTN portal representations into normalized invoice lines.
 *
 * Lane B (B5.3)
 */

import type { Gstr2bPortalJson, ParsedGstr2bLine } from "./types";

/**
 * Normalizes Indian portal dates (DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD) to ISO YYYY-MM-DD.
 */
export function normalizeGstDate(rawDate?: string | null): string {
  if (!rawDate) {
    return new Date().toISOString().split("T")[0]!;
  }
  const clean = rawDate.trim();
  if (clean.includes("-")) {
    const parts = clean.split("-");
    if (parts.length === 3) {
      if (parts[0]!.length === 4) return clean; // Already YYYY-MM-DD
      // DD-MM-YYYY
      return `${parts[2]}-${parts[1]!.padStart(2, "0")}-${parts[0]!.padStart(2, "0")}`;
    }
  } else if (clean.includes("/")) {
    const parts = clean.split("/");
    if (parts.length === 3) {
      if (parts[0]!.length === 4) return `${parts[0]}-${parts[1]!.padStart(2, "0")}-${parts[2]!.padStart(2, "0")}`;
      // DD/MM/YYYY
      return `${parts[2]}-${parts[1]!.padStart(2, "0")}-${parts[0]!.padStart(2, "0")}`;
    }
  }
  return clean;
}

/**
 * Normalizes filing period code (e.g. "102026" -> "2026-10", or "2026-10" -> "2026-10")
 */
export function normalizeReturnPeriod(fp?: string | null): string {
  if (!fp) return new Date().toISOString().slice(0, 7);
  const clean = fp.trim();
  if (clean.length === 6 && /^\d{6}$/.test(clean)) {
    const mm = clean.slice(0, 2);
    const yyyy = clean.slice(2);
    return `${yyyy}-${mm}`;
  }
  if (clean.length === 7 && clean.includes("-")) {
    return clean;
  }
  return clean;
}

/**
 * Derives Indian Financial Year (e.g. "2026-08" -> "2026-2027", "2027-02" -> "2026-2027")
 */
export function deriveFinancialYear(returnPeriod: string): string {
  const [yStr, mStr] = returnPeriod.split("-");
  const year = parseInt(yStr || "2026", 10);
  const month = parseInt(mStr || "4", 10);
  if (month >= 4) {
    return `${year}-${year + 1}`;
  } else {
    return `${year - 1}-${year}`;
  }
}

/**
 * Parses raw GSTR-2B JSON content (string or object) into structured lines.
 */
export function parseGstr2bJson(jsonContent: string | Record<string, unknown>): {
  gstin: string;
  returnPeriod: string;
  financialYear: string;
  lines: ParsedGstr2bLine[];
} {
  const payload: Gstr2bPortalJson =
    typeof jsonContent === "string" ? JSON.parse(jsonContent) : (jsonContent as unknown as Gstr2bPortalJson);

  const gstin = (payload.gstin || "").trim().toUpperCase();
  const returnPeriod = normalizeReturnPeriod(payload.fp);
  const financialYear = deriveFinancialYear(returnPeriod);

  const docdata = payload.data?.docdata || payload;
  const lines: ParsedGstr2bLine[] = [];

  // 1. Process B2B Invoices (Standard Inward Supplies)
  const b2bSuppliers = [...(docdata.b2b || []), ...(docdata.b2ba || [])];
  for (const supplier of b2bSuppliers) {
    const supplierGstin = (supplier.ctin || "").trim().toUpperCase();
    const supplierName = supplier.trdnm || supplier.suppr_legal_name || supplierGstin;

    if (!supplier.inv || !Array.isArray(supplier.inv)) continue;

    for (const inv of supplier.inv) {
      const invoiceNo = (inv.inum || "").trim();
      const invoiceDate = normalizeGstDate(inv.idt);
      const itcAvailability = (inv.itcavl || "Y").toUpperCase() === "N" ? "N" : "Y";

      let taxablePaise = 0;
      let cgstPaise = 0;
      let sgstPaise = 0;
      let igstPaise = 0;
      let cessPaise = 0;

      if (inv.items && Array.isArray(inv.items) && inv.items.length > 0) {
        for (const item of inv.items) {
          taxablePaise += Math.round((item.txval || 0) * 100);
          cgstPaise += Math.round((item.camt || 0) * 100);
          sgstPaise += Math.round((item.samt || 0) * 100);
          igstPaise += Math.round((item.iamt || 0) * 100);
          cessPaise += Math.round((item.csamt || 0) * 100);
        }
      } else {
        taxablePaise = Math.round((inv.val || 0) * 100);
      }

      const totalPaise = Math.round((inv.val || 0) * 100) || taxablePaise + cgstPaise + sgstPaise + igstPaise + cessPaise;

      lines.push({
        supplierGstin,
        supplierName,
        docType: "invoice",
        invoiceNo,
        invoiceDate,
        taxableAmountPaise: taxablePaise,
        cgstPaise,
        sgstPaise,
        igstPaise,
        cessPaise,
        totalAmountPaise: totalPaise,
        itcAvailability,
        itcReason: inv.rsn,
      });
    }
  }

  // 2. Process CDNR (Credit / Debit Notes)
  const cdnrSuppliers = [...(docdata.cdnr || []), ...(docdata.cdnra || [])];
  for (const supplier of cdnrSuppliers) {
    const supplierGstin = (supplier.ctin || "").trim().toUpperCase();
    const supplierName = supplier.trdnm || supplierGstin;

    if (!supplier.nt || !Array.isArray(supplier.nt)) continue;

    for (const note of supplier.nt) {
      const invoiceNo = (note.nt_num || "").trim();
      const invoiceDate = normalizeGstDate(note.nt_dt);
      const docType = note.typ === "D" ? "debit_note" : "credit_note";

      let taxablePaise = 0;
      let cgstPaise = 0;
      let sgstPaise = 0;
      let igstPaise = 0;
      let cessPaise = 0;

      if (note.items && Array.isArray(note.items) && note.items.length > 0) {
        for (const item of note.items) {
          taxablePaise += Math.round((item.txval || 0) * 100);
          cgstPaise += Math.round((item.camt || 0) * 100);
          sgstPaise += Math.round((item.samt || 0) * 100);
          igstPaise += Math.round((item.iamt || 0) * 100);
          cessPaise += Math.round((item.csamt || 0) * 100);
        }
      } else {
        taxablePaise = Math.round((note.val || 0) * 100);
      }

      const totalPaise = Math.round((note.val || 0) * 100) || taxablePaise + cgstPaise + sgstPaise + igstPaise + cessPaise;

      lines.push({
        supplierGstin,
        supplierName,
        docType,
        invoiceNo,
        invoiceDate,
        taxableAmountPaise: taxablePaise,
        cgstPaise,
        sgstPaise,
        igstPaise,
        cessPaise,
        totalAmountPaise: totalPaise,
        itcAvailability: "Y",
      });
    }
  }

  return {
    gstin,
    returnPeriod,
    financialYear,
    lines,
  };
}

