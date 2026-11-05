import { ImsAction } from "./types";
import { ReconciledLine } from "./match-engine";

export interface ImsExportLine {
  supplierGstin: string;
  supplierName: string;
  docType: string;
  invoiceNo: string;
  invoiceDate: string; // YYYY-MM-DD
  taxableAmountPaise: number;
  igstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  cessPaise: number;
  totalAmountPaise: number;
  imsAction: ImsAction;
  remarks?: string | null;
}

/**
 * Converts date from YYYY-MM-DD to Indian format DD-MM-YYYY for GST portal upload
 */
export function formatIndianGstDate(isoDate: string): string {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return isoDate;
}

/**
 * Formats integer paise into standard 2-decimal rupee string
 */
export function formatRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/**
 * Escapes values for safe CSV generation
 */
function escapeCsv(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '""';
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * Generates official GSTN IMS (Invoice Management System) Bulk Action CSV
 */
export function generateImsBulkActionCsv(lines: ImsExportLine[]): string {
  const headers = [
    "GSTIN of Supplier",
    "Trade / Legal Name",
    "Document Type",
    "Document Number",
    "Document Date",
    "Taxable Value (INR)",
    "IGST (INR)",
    "CGST (INR)",
    "SGST (INR)",
    "Cess (INR)",
    "Total Invoice Value (INR)",
    "IMS Action",
    "Remarks",
  ];

  const rows = lines.map((l) => {
    const actionLabel =
      l.imsAction === "accept" ? "Accept" : l.imsAction === "reject" ? "Reject" : "Pending";

    return [
      escapeCsv(l.supplierGstin),
      escapeCsv(l.supplierName),
      escapeCsv(l.docType),
      escapeCsv(l.invoiceNo),
      escapeCsv(formatIndianGstDate(l.invoiceDate)),
      escapeCsv(formatRupees(l.taxableAmountPaise)),
      escapeCsv(formatRupees(l.igstPaise)),
      escapeCsv(formatRupees(l.cgstPaise)),
      escapeCsv(formatRupees(l.sgstPaise)),
      escapeCsv(formatRupees(l.cessPaise)),
      escapeCsv(formatRupees(l.totalAmountPaise)),
      escapeCsv(actionLabel),
      escapeCsv(l.remarks || ""),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\r\n");
}

/**
 * Helper to convert ReconciledLine list to ImsExportLine list
 */
export function toImsExportLines(lines: ReconciledLine[]): ImsExportLine[] {
  return lines.map((l) => ({
    supplierGstin: l.supplierGstin,
    supplierName: l.supplierName || "",
    docType: l.docType,
    invoiceNo: l.invoiceNo,
    invoiceDate: l.invoiceDate,
    taxableAmountPaise: l.taxableAmount,
    igstPaise: l.igst,
    cgstPaise: l.cgst,
    sgstPaise: l.sgst,
    cessPaise: l.cess,
    totalAmountPaise: l.totalAmount,
    imsAction: l.imsAction,
    remarks: l.itcReason,
  }));
}
