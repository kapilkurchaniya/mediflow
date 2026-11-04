import type { DayBookFilter, DayBookReport, LedgerFilter, LedgerReport } from "./types";
import { getDayBookReport } from "./day-book";
import { getAccountLedgerReport } from "./account-ledger";

/**
 * Sanitizes untrusted text cells to prevent CSV formula injection in spreadsheet applications.
 * Does NOT sanitize pure numeric columns (so Excel retains numeric type).
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Neutralize formula triggers
  const sanitized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}

export function formatPaiseDecimal(paise: number): string {
  return (paise / 100).toFixed(2);
}

export async function generateDayBookCsv(
  tenantId: string,
  filter: DayBookFilter,
): Promise<string> {
  // Use high limit to fetch complete dataset for snapshot export
  const report: DayBookReport = await getDayBookReport(tenantId, {
    ...filter,
    limit: 5000,
    offset: 0,
  });

  const headers = [
    "Date",
    "Voucher No",
    "Type",
    "Store",
    "Account Code",
    "Account Name",
    "Particulars / Narration",
    "Party",
    "Debit (INR)",
    "Credit (INR)",
  ];

  const rows: string[] = [headers.join(",")];

  for (const entry of report.entries) {
    for (const line of entry.lines) {
      rows.push(
        [
          sanitizeCsvCell(entry.entryDate),
          sanitizeCsvCell(entry.entryNo),
          sanitizeCsvCell(entry.refType ?? "journal"),
          sanitizeCsvCell(entry.storeName ?? "Unallocated / Tenant-Wide"),
          sanitizeCsvCell(line.accountCode),
          sanitizeCsvCell(line.accountName),
          sanitizeCsvCell(entry.narration),
          sanitizeCsvCell(line.partyName ?? ""),
          formatPaiseDecimal(line.debit),
          formatPaiseDecimal(line.credit),
        ].join(","),
      );
    }
  }

  // Summary Row
  rows.push("");
  rows.push(
    [
      "TOTALS",
      "",
      "",
      "",
      "",
      "",
      `Vouchers: ${report.totalVouchers}`,
      "",
      formatPaiseDecimal(report.totalDebit),
      formatPaiseDecimal(report.totalCredit),
    ].join(","),
  );

  return rows.join("\r\n");
}

export async function generateLedgerCsv(
  tenantId: string,
  filter: LedgerFilter,
): Promise<string> {
  const report: LedgerReport = await getAccountLedgerReport(tenantId, {
    ...filter,
    limit: 5000,
    cursor: null,
  });

  const rows: string[] = [];
  rows.push(`Account,${sanitizeCsvCell(`${report.account.code} - ${report.account.name}`)}`);
  rows.push(`Account Type,${sanitizeCsvCell(report.account.type)}`);
  rows.push(
    `Period,${sanitizeCsvCell(filter.dateRange.from ?? "Beginning")} to ${sanitizeCsvCell(filter.dateRange.to ?? "Latest")}`,
  );
  rows.push("");

  const headers = [
    "Date",
    "Voucher No",
    "Type",
    "Particulars",
    "Debit (INR)",
    "Credit (INR)",
    "Running Balance (INR)",
    "Side",
  ];
  rows.push(headers.join(","));

  // Opening Balance Row
  rows.push(
    [
      sanitizeCsvCell(filter.dateRange.from ?? ""),
      "",
      "",
      sanitizeCsvCell("Opening Balance"),
      "",
      "",
      formatPaiseDecimal(report.periodOpeningBalance),
      report.periodOpeningSide.toUpperCase(),
    ].join(","),
  );

  for (const row of report.rows) {
    rows.push(
      [
        sanitizeCsvCell(row.entryDate),
        sanitizeCsvCell(row.entryNo),
        sanitizeCsvCell(row.voucherType ?? "journal"),
        sanitizeCsvCell(row.particulars),
        formatPaiseDecimal(row.debit),
        formatPaiseDecimal(row.credit),
        formatPaiseDecimal(row.runningBalance),
        row.runningSide.toUpperCase(),
      ].join(","),
    );
  }

  // Closing Balance Row
  rows.push(
    [
      sanitizeCsvCell(filter.dateRange.to ?? ""),
      "",
      "",
      sanitizeCsvCell("Closing Balance"),
      formatPaiseDecimal(report.periodDebitTotal),
      formatPaiseDecimal(report.periodCreditTotal),
      formatPaiseDecimal(report.periodClosingBalance),
      report.periodClosingSide.toUpperCase(),
    ].join(","),
  );

  return rows.join("\r\n");
}
