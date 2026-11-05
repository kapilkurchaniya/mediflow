import { db, schema, type DbOrTx } from "@/server/db";
import { and, eq, gt, isNull, sql, type SQL } from "drizzle-orm";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type {
  AgeingBucketKey,
  AgeingMode,
  InvoiceOpenBalance,
  ReportStoreScope,
} from "./types";

export function buildSalesStoreScopeCondition(storeScope: ReportStoreScope): SQL {
  if (storeScope.type === "store") {
    return eq(schema.sales.storeId, storeScope.storeId);
  }
  if (storeScope.type === "unallocated") {
    return isNull(schema.sales.storeId);
  }
  return sql`TRUE`;
}

/**
 * Calculates the authoritative due date for a sale invoice.
 * Falls back to sale completedAt date if completedAt is missing.
 */
export function computeInvoiceDueDate(
  completedAt: Date | string | null,
  creditDays: number,
): string {
  const baseDate = completedAt
    ? typeof completedAt === "string"
      ? parseISO(completedAt)
      : completedAt
    : new Date();
  return format(addDays(baseDate, Math.max(0, creditDays)), "yyyy-MM-dd");
}

/**
 * Determines which of the 5 standard ageing buckets an overdue or bill-age day count falls into.
 * Overdue: <= 0 days is 'current'.
 */
export function assignAgeingBucket(days: number): AgeingBucketKey {
  if (days <= 0) return "current";
  if (days <= 30) return "days1to30";
  if (days <= 60) return "days31to60";
  if (days <= 90) return "days61to90";
  return "over90";
}

/**
 * Fetches all open completed sales for a customer under the given store scope,
 * computing canonical open balances and ageing metrics as of `asOfDate`.
 */
export async function getOpenInvoicesForCustomer(
  tenantId: string,
  customerId: string,
  storeScope: ReportStoreScope,
  asOfDate: string = format(new Date(), "yyyy-MM-dd"),
  mode: AgeingMode = "due_date",
  d: DbOrTx = db,
): Promise<InvoiceOpenBalance[]> {
  const storeCond = buildSalesStoreScopeCondition(storeScope);
  const asOfParsed = parseISO(asOfDate);

  const [customerRow] = await d
    .select({ creditDays: schema.customers.creditDays })
    .from(schema.customers)
    .where(and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.id, customerId)))
    .limit(1);

  const defaultCreditDays = customerRow?.creditDays ?? 30;

  const salesRows = await d
    .select({
      id: schema.sales.id,
      invoiceNo: schema.sales.invoiceNo,
      completedAt: schema.sales.completedAt,
      storeId: schema.sales.storeId,
      storeName: schema.stores.name,
      customerId: schema.sales.customerId,
      totalAmount: schema.sales.totalAmount,
      paidAmount: schema.sales.paidAmount,
      returnedAmount: schema.sales.returnedAmount,
      creditAmount: schema.sales.creditAmount,
    })
    .from(schema.sales)
    .leftJoin(schema.stores, eq(schema.sales.storeId, schema.stores.id))
    .where(
      and(
        eq(schema.sales.tenantId, tenantId),
        eq(schema.sales.customerId, customerId),
        eq(schema.sales.status, "completed"),
        gt(schema.sales.creditAmount, 0),
        storeCond,
      ),
    )
    .orderBy(schema.sales.completedAt);

  return salesRows.map((s) => {
    const completedDate = s.completedAt ?? new Date();
    const completedStr = format(completedDate, "yyyy-MM-dd");
    const dueDateStr = computeInvoiceDueDate(completedDate, defaultCreditDays);
    const dueDateParsed = parseISO(dueDateStr);

    const daysOverdue = differenceInCalendarDays(asOfParsed, dueDateParsed);
    const daysSinceInvoice = differenceInCalendarDays(asOfParsed, completedDate);

    const comparisonDays = mode === "due_date" ? daysOverdue : daysSinceInvoice;
    const bucket = assignAgeingBucket(comparisonDays);
    const openBalance = Math.max(0, s.creditAmount ?? 0);

    return {
      saleId: s.id,
      invoiceNo: s.invoiceNo ?? "N/A",
      completedAt: completedStr,
      storeId: s.storeId,
      storeName: s.storeName ?? "Main Store",
      customerId: s.customerId || customerId,
      totalAmount: s.totalAmount ?? 0,
      paidAmount: s.paidAmount ?? 0,
      returnedAmount: s.returnedAmount ?? 0,
      creditAmount: s.creditAmount ?? 0,
      openBalance,
      dueDate: dueDateStr,
      daysOverdue: Math.max(0, daysOverdue),
      daysSinceInvoice: Math.max(0, daysSinceInvoice),
      bucket,
    };
  });
}
