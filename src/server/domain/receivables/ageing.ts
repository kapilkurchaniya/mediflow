import { db, schema, type DbOrTx } from "@/server/db";
import { and, eq, gt, ilike, inArray, or } from "drizzle-orm";
import { format } from "date-fns";
import type {
  AgeingBuckets,
  AgeingMode,
  CustomerExposure,
  ReceivablesAgeingFilter,
  ReceivablesReport,
} from "./types";
import { buildSalesStoreScopeCondition } from "./invoice-balances";
import { computeEmptyBuckets, getCustomerExposure } from "./outstanding";

/**
 * Builds the comprehensive receivables ageing report.
 * Provides tenant-wide or store-scoped summaries and customer-by-customer ageing breakdowns.
 */
export async function getReceivablesAgeingReport(
  tenantId: string,
  filter: ReceivablesAgeingFilter,
  d: DbOrTx = db,
): Promise<ReceivablesReport> {
  const {
    asOfDate = format(new Date(), "yyyy-MM-dd"),
    mode = "due_date" as AgeingMode,
    storeScope,
    search,
    customerId,
    onlyOverdue = false,
    limit = 50,
    offset = 0,
  } = filter;

  const storeCond = buildSalesStoreScopeCondition(storeScope);

  // 1. Identify all customers with open credit balances under this store scope
  const customerConditions = [
    eq(schema.sales.tenantId, tenantId),
    eq(schema.sales.status, "completed"),
    gt(schema.sales.creditAmount, 0),
    storeCond,
  ];

  if (customerId) {
    customerConditions.push(eq(schema.sales.customerId, customerId));
  }

  // Find distinct customer IDs from sales
  const matchingSales = await d
    .select({
      customerId: schema.sales.customerId,
    })
    .from(schema.sales)
    .where(and(...customerConditions));

  let candidateIds = [...new Set(matchingSales.map((s) => s.customerId).filter(Boolean))] as string[];

  // If search filter is active, filter candidate IDs by name or phone
  if (search && candidateIds.length > 0) {
    const matchedCustomers = await d
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.tenantId, tenantId),
          inArray(schema.customers.id, candidateIds),
          or(
            ilike(schema.customers.name, `%${search}%`),
            ilike(schema.customers.phone, `%${search}%`),
          ),
        ),
      );
    candidateIds = matchedCustomers.map((c) => c.id);
  }

  // 2. Fetch exposure and ageing metrics for all candidate customers
  const customerExposures: CustomerExposure[] = [];
  for (const cId of candidateIds) {
    const exp = await getCustomerExposure(tenantId, cId, storeScope, asOfDate, mode, d);
    if (exp) {
      if (!onlyOverdue || exp.isOverdue) {
        customerExposures.push(exp);
      }
    }
  }

  // Sort by highest net exposure first
  customerExposures.sort((a, b) => b.netExposure - a.netExposure);

  // 3. Compute Summary Buckets over all qualifying customers
  const summaryBuckets: AgeingBuckets = computeEmptyBuckets();
  let totalGrossReceivables = 0;
  let totalAvailableCredits = 0;
  let totalNetExposure = 0;

  for (const exp of customerExposures) {
    summaryBuckets.current += exp.buckets.current;
    summaryBuckets.days1to30 += exp.buckets.days1to30;
    summaryBuckets.days31to60 += exp.buckets.days31to60;
    summaryBuckets.days61to90 += exp.buckets.days61to90;
    summaryBuckets.over90 += exp.buckets.over90;
    summaryBuckets.total += exp.buckets.total;

    totalGrossReceivables += exp.grossReceivables;
    totalAvailableCredits += exp.availableCredits;
    totalNetExposure += exp.netExposure;
  }

  // 4. Paginate customer list for the UI view
  const paginatedCustomers = customerExposures.slice(offset, offset + limit);

  return {
    asOfDate,
    mode,
    storeScope,
    totalCustomers: customerExposures.length,
    summaryBuckets,
    totalGrossReceivables,
    totalAvailableCredits,
    totalNetExposure,
    customers: paginatedCustomers,
  };
}
