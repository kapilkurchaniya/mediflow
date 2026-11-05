/**
 * src/server/domain/gst-reconciliation/types.ts
 *
 * Core types for GSTR-2B Inward Supply Reconciliation & Invoice Management System (IMS).
 *
 * Lane B (B5.3)
 */

export type GstMatchStatus =
  | "exact_match"
  | "tolerance_match"
  | "mismatch"
  | "missing_in_books"
  | "missing_in_2b";

export type ImsAction = "pending" | "accept" | "reject" | "reset";

export interface Gstr2bRawItem {
  num?: number;
  txval?: number;
  iamt?: number;
  camt?: number;
  samt?: number;
  csamt?: number;
  rt?: number;
}

export interface Gstr2bRawInvoice {
  inum: string; // Invoice number
  idt: string; // Invoice date (DD-MM-YYYY)
  val: number; // Invoice total value in INR
  pos?: string; // Place of supply
  rchrg?: "Y" | "N";
  inv_typ?: string; // R - Regular, SEZWP, etc.
  itcavl?: "Y" | "N";
  rsn?: string;
  items?: Gstr2bRawItem[];
}

export interface Gstr2bRawSupplierSection {
  ctin: string; // Supplier GSTIN
  trdnm?: string; // Trade name
  suppr_legal_name?: string;
  cfs?: string;
  inv?: Gstr2bRawInvoice[];
}

export interface Gstr2bRawCdnr {
  nt_num: string;
  nt_dt: string;
  val: number;
  typ?: "C" | "D"; // Credit / Debit note
  items?: Gstr2bRawItem[];
}

export interface Gstr2bRawSupplierCdnr {
  ctin: string;
  trdnm?: string;
  nt?: Gstr2bRawCdnr[];
}

export interface Gstr2bPortalJson {
  gstin: string;
  fp: string; // Filing period e.g. "102026" (MMYYYY) or "2026-10"
  data?: {
    docdata?: {
      b2b?: Gstr2bRawSupplierSection[];
      b2ba?: Gstr2bRawSupplierSection[];
      cdnr?: Gstr2bRawSupplierCdnr[];
      cdnra?: Gstr2bRawSupplierCdnr[];
    };
  };
  // Fallback for flat structure
  b2b?: Gstr2bRawSupplierSection[];
  b2ba?: Gstr2bRawSupplierSection[];
  cdnr?: Gstr2bRawSupplierCdnr[];
  cdnra?: Gstr2bRawSupplierCdnr[];
}

export interface ParsedGstr2bLine {
  supplierGstin: string;
  supplierName: string;
  docType: "invoice" | "credit_note" | "debit_note";
  invoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  totalAmountPaise: number;
  itcAvailability: "Y" | "N";
  itcReason?: string;
}

export interface Gstr2bReconSummary {
  total2bInvoices: number;
  total2bTaxablePaise: number;
  total2bItcPaise: number;
  matchedCount: number;
  matchedItcPaise: number;
  toleranceCount: number;
  toleranceItcPaise: number;
  mismatchCount: number;
  mismatchItcPaise: number;
  missingInBooksCount: number;
  missingInBooksItcPaise: number;
  missingIn2bCount: number;
  missingIn2bBooksPaise: number;
}

