export type ImsActionStatus = "pending" | "accepted" | "rejected";

export interface ImsInvoiceRecord {
  id: string;
  supplierGstin: string;
  supplierName: string;
  invoiceNo: string;
  invoiceDate: string;
  taxablePaise: number;
  taxPaise: number;
  totalPaise: number;
  matchedPurchaseId?: string | null;
  imsStatus: ImsActionStatus;
}

export interface ImsSummary {
  totalInvoices: number;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
  eligibleItcPaise: number;
  blockedItcPaise: number;
}

/**
 * Computes GST IMS (Invoice Management System) / GSTR-2B ITC summary (G3).
 * Only "accepted" invoices unlock ITC in GSTR-3B Table 4 under the 2026 IMS rules.
 */
export function summarizeImsInvoices(invoices: ImsInvoiceRecord[]): ImsSummary {
  let acceptedCount = 0;
  let rejectedCount = 0;
  let pendingCount = 0;
  let eligibleItcPaise = 0;
  let blockedItcPaise = 0;

  for (const inv of invoices) {
    if (inv.imsStatus === "accepted") {
      acceptedCount++;
      eligibleItcPaise += inv.taxPaise;
    } else if (inv.imsStatus === "rejected") {
      rejectedCount++;
      blockedItcPaise += inv.taxPaise;
    } else {
      pendingCount++;
      blockedItcPaise += inv.taxPaise;
    }
  }

  return {
    totalInvoices: invoices.length,
    acceptedCount,
    rejectedCount,
    pendingCount,
    eligibleItcPaise,
    blockedItcPaise,
  };
}
