import { db } from "@/server/db";
import { schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { DomainError } from "@/server/errors";

/**
 * Sanitizes a string for RFC 4180 CSV generation to prevent formula injection.
 * Prepends a single quote if the value begins with [=, +, -, @, \t, \r].
 */
export function sanitizeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  const dangerousChars = ["=", "+", "-", "@", "\t", "\r"];
  const sanitized = dangerousChars.some((char) => str.startsWith(char)) ? `'${str}` : str;
  return `"${sanitized.replace(/"/g, '""')}"`;
}

/** Formats paise into rupee decimal string (e.g. 15000 -> "150.00"). */
export function formatPaiseToRupees(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** Generates an RFC 4180 compliant CSV export for a year-end closing stock snapshot. */
export async function exportYearEndClosingStockCsv(
  tenantId: string,
  storeId: string,
  snapshotId: string,
): Promise<string> {
  const snapshot = await db.query.yearEndStockSnapshots.findFirst({
    where: and(
      eq(schema.yearEndStockSnapshots.tenantId, tenantId),
      eq(schema.yearEndStockSnapshots.storeId, storeId),
      eq(schema.yearEndStockSnapshots.id, snapshotId),
    ),
  });
  if (!snapshot) throw new DomainError("SNAPSHOT_NOT_FOUND", "Snapshot not found");

  const items = await db.query.yearEndStockItems.findMany({
    where: and(
      eq(schema.yearEndStockItems.tenantId, tenantId),
      eq(schema.yearEndStockItems.storeId, storeId),
      eq(schema.yearEndStockItems.snapshotId, snapshotId),
    ),
  });

  const headers = [
    "Batch Number",
    "Expiry Date",
    "Classification",
    "Quantity",
    "Unit Cost (INR)",
    "Cost Value (INR)",
    "NRV Unit (INR)",
    "NRV Basis",
    "Overridden",
    "Override Reason",
    "Final Valuation (INR)",
    "Provision (INR)",
  ];

  const rows = items.map((item) => [
    sanitizeCsvField(item.batchNumber),
    sanitizeCsvField(item.expiryDate),
    sanitizeCsvField(item.classification),
    sanitizeCsvField(item.qty),
    sanitizeCsvField(formatPaiseToRupees(item.landedCostPaise)),
    sanitizeCsvField(formatPaiseToRupees(item.costValuePaise)),
    sanitizeCsvField(formatPaiseToRupees(item.nrvPaise)),
    sanitizeCsvField(item.nrvBasis),
    sanitizeCsvField(item.isOverridden ? "Yes" : "No"),
    sanitizeCsvField(item.overrideReason ?? ""),
    sanitizeCsvField(formatPaiseToRupees(item.finalValuationPaise)),
    sanitizeCsvField(formatPaiseToRupees(item.provisionPaise)),
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  return csvContent;
}
