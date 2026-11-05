import { ParsedGstr2bLine, GstMatchStatus, ImsAction } from "./types";

export interface BookPurchaseCandidate {
  id: string;
  purchaseNo: string;
  supplierInvoiceNo: string;
  supplierGstin?: string | null;
  supplierName?: string | null;
  invoiceDate: string; // YYYY-MM-DD
  taxableAmount: number; // paise
  cgst: number; // paise
  sgst: number; // paise
  igst: number; // paise
  totalAmount: number; // paise
}

export interface ReconciledLine {
  supplierGstin: string;
  supplierName?: string | null;
  docType: "invoice" | "credit_note" | "debit_note";
  invoiceNo: string;
  invoiceDate: string;
  taxableAmount: number; // paise
  cgst: number; // paise
  sgst: number; // paise
  igst: number; // paise
  cess: number; // paise
  totalAmount: number; // paise
  itcAvailability: "Y" | "N";
  itcReason?: string | null;
  matchedPurchaseId: string | null;
  matchStatus: GstMatchStatus;
  matchVarianceAmount: number; // paise
  matchNotes?: string | null;
  imsAction: ImsAction;
}

/**
 * Normalizes invoice numbers across accounting differences (e.g., INV/2026/00142 vs INV-2026-142)
 */
export function normalizeInvoiceNo(invNo: string): string {
  if (!invNo) return "";
  return invNo
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .map((seg) => seg.replace(/^0+/, ""))
    .join("")
    .toUpperCase();
}

/**
 * Calculates absolute calendar day difference between two YYYY-MM-DD dates
 */
export function dateDiffDays(d1: string, d2: string): number {
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  if (isNaN(t1) || isNaN(t2)) return 999;
  return Math.abs(Math.round((t1 - t2) / (1000 * 60 * 60 * 24)));
}

/**
 * Normalizes GSTIN (trims and upper cases)
 */
export function normalizeGstin(gstin?: string | null): string {
  return (gstin || "").trim().toUpperCase();
}

export interface MatchEngineResult {
  lines: ReconciledLine[];
  missingIn2bPurchases: BookPurchaseCandidate[];
  summary: {
    total2bInvoices: number;
    exactMatches: number;
    toleranceMatches: number;
    mismatches: number;
    missingInBooks: number;
    missingIn2b: number;
    total2bTaxPaise: number;
    matchedTaxPaise: number;
    atRiskTaxPaise: number;
  };
}

/**
 * Core 4-Tier GSTR-2B & Book Reconciliation Engine
 * Statutory Rules: CGST Sec 16(2)(aa) & Sec 170 (Rounding tolerance <= 200 paise / Rs 2.00)
 */
export function reconcileGstr2bWithBooks(
  parsed2bLines: ParsedGstr2bLine[],
  bookPurchases: BookPurchaseCandidate[]
): MatchEngineResult {
  const matchedPurchaseIds = new Set<string>();
  const reconciledLines: ReconciledLine[] = [];

  // Index book purchases by: normalizeGstin(supplierGstin) + "::" + normalizeInvoiceNo(supplierInvoiceNo)
  const purchaseIndex = new Map<string, BookPurchaseCandidate[]>();

  for (const p of bookPurchases) {
    if (!p.supplierGstin) continue;
    const key = `${normalizeGstin(p.supplierGstin)}::${normalizeInvoiceNo(p.supplierInvoiceNo)}`;
    const existing = purchaseIndex.get(key) || [];
    existing.push(p);
    purchaseIndex.set(key, existing);
  }

  let exactMatches = 0;
  let toleranceMatches = 0;
  let mismatches = 0;
  let missingInBooks = 0;
  let total2bTaxPaise = 0;
  let matchedTaxPaise = 0;
  let atRiskTaxPaise = 0;

  for (const line of parsed2bLines) {
    const lineTotalTax = line.cgstPaise + line.sgstPaise + line.igstPaise + line.cessPaise;
    total2bTaxPaise += lineTotalTax;

    const gstinKey = normalizeGstin(line.supplierGstin);
    const invKey = normalizeInvoiceNo(line.invoiceNo);
    const lookupKey = `${gstinKey}::${invKey}`;

    const candidates = purchaseIndex.get(lookupKey) || [];
    // Find candidate that hasn't already been consumed
    const candidate = candidates.find((c) => !matchedPurchaseIds.has(c.id));

    if (candidate) {
      matchedPurchaseIds.add(candidate.id);
      const days = dateDiffDays(line.invoiceDate, candidate.invoiceDate);

      const candidateTotalTax = (candidate.cgst || 0) + (candidate.sgst || 0) + (candidate.igst || 0);
      const taxVariance = Math.abs(lineTotalTax - candidateTotalTax);
      const taxableVariance = Math.abs(line.taxableAmountPaise - (candidate.taxableAmount || 0));
      const totalAmountVariance = Math.abs(line.totalAmountPaise - (candidate.totalAmount || 0));

      const maxVariancePaise = Math.max(taxVariance, taxableVariance, totalAmountVariance);

      if (maxVariancePaise === 0 && days === 0) {
        // Tier 1: Exact Match
        exactMatches++;
        matchedTaxPaise += lineTotalTax;
        reconciledLines.push({
          supplierGstin: line.supplierGstin,
          supplierName: line.supplierName,
          docType: line.docType,
          invoiceNo: line.invoiceNo,
          invoiceDate: line.invoiceDate,
          taxableAmount: line.taxableAmountPaise,
          cgst: line.cgstPaise,
          sgst: line.sgstPaise,
          igst: line.igstPaise,
          cess: line.cessPaise,
          totalAmount: line.totalAmountPaise,
          itcAvailability: line.itcAvailability,
          itcReason: null,
          matchedPurchaseId: candidate.id,
          matchStatus: "exact_match",
          matchVarianceAmount: 0,
          matchNotes: "Exact match with purchase books",
          imsAction: "accept",
        });
      } else if (maxVariancePaise <= 200 && days <= 3) {
        // Tier 2: Tolerance Match (<= 200 paise / Rs 2.00, date within +/- 3 days)
        toleranceMatches++;
        matchedTaxPaise += lineTotalTax;
        reconciledLines.push({
          supplierGstin: line.supplierGstin,
          supplierName: line.supplierName,
          docType: line.docType,
          invoiceNo: line.invoiceNo,
          invoiceDate: line.invoiceDate,
          taxableAmount: line.taxableAmountPaise,
          cgst: line.cgstPaise,
          sgst: line.sgstPaise,
          igst: line.igstPaise,
          cess: line.cessPaise,
          totalAmount: line.totalAmountPaise,
          itcAvailability: line.itcAvailability,
          itcReason: null,
          matchedPurchaseId: candidate.id,
          matchStatus: "tolerance_match",
          matchVarianceAmount: maxVariancePaise,
          matchNotes: `Tolerance match (variance: ₹${(maxVariancePaise / 100).toFixed(2)}, date diff: ${days}d)`,
          imsAction: "accept",
        });
      } else {
        // Tier 3: Mismatch in Books
        mismatches++;
        atRiskTaxPaise += lineTotalTax;
        reconciledLines.push({
          supplierGstin: line.supplierGstin,
          supplierName: line.supplierName,
          docType: line.docType,
          invoiceNo: line.invoiceNo,
          invoiceDate: line.invoiceDate,
          taxableAmount: line.taxableAmountPaise,
          cgst: line.cgstPaise,
          sgst: line.sgstPaise,
          igst: line.igstPaise,
          cess: line.cessPaise,
          totalAmount: line.totalAmountPaise,
          itcAvailability: line.itcAvailability,
          itcReason: `Variance: ₹${(maxVariancePaise / 100).toFixed(2)}${days > 0 ? `, Date diff: ${days}d` : ""}`,
          matchedPurchaseId: candidate.id,
          matchStatus: "mismatch",
          matchVarianceAmount: maxVariancePaise,
          matchNotes: `Book amount mismatch (variance: ₹${(maxVariancePaise / 100).toFixed(2)})`,
          imsAction: "pending",
        });
      }
    } else {
      // Tier 4A: Missing in Books (Unclaimed ITC)
      missingInBooks++;
      reconciledLines.push({
        supplierGstin: line.supplierGstin,
        supplierName: line.supplierName,
        docType: line.docType,
        invoiceNo: line.invoiceNo,
        invoiceDate: line.invoiceDate,
        taxableAmount: line.taxableAmountPaise,
        cgst: line.cgstPaise,
        sgst: line.sgstPaise,
        igst: line.igstPaise,
        cess: line.cessPaise,
        totalAmount: line.totalAmountPaise,
        itcAvailability: line.itcAvailability,
        itcReason: "Invoice present in GSTR-2B but missing from purchases ledger",
        matchedPurchaseId: null,
        matchStatus: "missing_in_books",
        matchVarianceAmount: line.totalAmountPaise,
        matchNotes: "Missing from books",
        imsAction: "pending",
      });
    }
  }

  // Tier 4B: Missing in 2B (Purchases recorded in books with GSTIN that supplier did not file)
  const missingIn2bPurchases = bookPurchases.filter((p) => p.supplierGstin && !matchedPurchaseIds.has(p.id));

  return {
    lines: reconciledLines,
    missingIn2bPurchases,
    summary: {
      total2bInvoices: parsed2bLines.length,
      exactMatches,
      toleranceMatches,
      mismatches,
      missingInBooks,
      missingIn2b: missingIn2bPurchases.length,
      total2bTaxPaise,
      matchedTaxPaise,
      atRiskTaxPaise,
    },
  };
}
