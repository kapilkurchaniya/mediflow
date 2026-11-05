import { db, schema, type DbOrTx } from "@/server/db";
import { and, eq, inArray } from "drizzle-orm";
import { format } from "date-fns";
import type {
  AgeingBuckets,
  AgeingMode,
  CustomerExposure,
  InvoiceOpenBalance,
  ReportStoreScope,
} from "./types";
import { getOpenInvoicesForCustomer } from "./invoice-balances";
import { getCustomerAvailableCredits } from "./customer-credits";

export function computeEmptyBuckets(): AgeingBuckets {
  return {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    over90: 0,
    total: 0,
  };
}

export function aggregateInvoiceBuckets(invoices: InvoiceOpenBalance[]): AgeingBuckets {
  const buckets = computeEmptyBuckets();
  for (const inv of invoices) {
    buckets[inv.bucket] += inv.openBalance;
    buckets.total += inv.openBalance;
  }
  return buckets;
}

/**
 * Computes individual customer exposure, ageing buckets, credit term status,
 * and family group pooled exposure if assigned to a group.
 */
export async function getCustomerExposure(
  tenantId: string,
  customerId: string,
  storeScope: ReportStoreScope,
  asOfDate: string = format(new Date(), "yyyy-MM-dd"),
  mode: AgeingMode = "due_date",
  d: DbOrTx = db,
): Promise<CustomerExposure | null> {
  const [customer] = await d
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      phone: schema.customers.phone,
      creditLimit: schema.customers.creditLimit,
      creditDays: schema.customers.creditDays,
      groupId: schema.customers.groupId,
    })
    .from(schema.customers)
    .where(and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.id, customerId)))
    .limit(1);

  if (!customer) return null;

  const openInvoices = await getOpenInvoicesForCustomer(
    tenantId,
    customerId,
    storeScope,
    asOfDate,
    mode,
    d,
  );

  const credits = await getCustomerAvailableCredits(tenantId, customerId, storeScope, d);
  const buckets = aggregateInvoiceBuckets(openInvoices);
  const grossReceivables = buckets.total;
  const availableCredits = credits.totalAvailableCredits;
  const netExposure = Math.max(0, grossReceivables - availableCredits);

  let maxDaysOverdue = 0;
  let oldestOverdueDate: string | null = null;

  for (const inv of openInvoices) {
    if (inv.daysOverdue > maxDaysOverdue) {
      maxDaysOverdue = inv.daysOverdue;
      oldestOverdueDate = inv.dueDate;
    }
  }

  const isOverdue = maxDaysOverdue > 0;
  const creditLimit = customer.creditLimit ?? 0;
  const isLimitExceeded = creditLimit > 0 && netExposure > creditLimit;

  // Family group information if customer belongs to a family group
  let groupName: string | null = null;
  let groupCreditLimit: number | null = null;
  let groupTotalExposure: number | null = null;

  if (customer.groupId) {
    const [group] = await d
      .select({
        id: schema.customerGroups.id,
        name: schema.customerGroups.name,
        creditLimit: schema.customerGroups.creditLimit,
      })
      .from(schema.customerGroups)
      .where(and(eq(schema.customerGroups.tenantId, tenantId), eq(schema.customerGroups.id, customer.groupId)))
      .limit(1);

    if (group) {
      groupName = group.name;
      groupCreditLimit = group.creditLimit ?? null;

      // Compute total exposure of all group members
      const groupMembers = await d
        .select({ id: schema.customers.id })
        .from(schema.customers)
        .where(and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.groupId, customer.groupId)));

      const memberIds = groupMembers.map((m) => m.id);
      if (memberIds.length > 0) {
        const memberSales = await d
          .select({
            creditAmount: schema.sales.creditAmount,
          })
          .from(schema.sales)
          .where(
            and(
              eq(schema.sales.tenantId, tenantId),
              eq(schema.sales.status, "completed"),
              inArray(schema.sales.customerId, memberIds),
            ),
          );

        groupTotalExposure = memberSales.reduce((acc, s) => acc + (s.creditAmount ?? 0), 0);
      }
    }
  }

  return {
    customerId: customer.id,
    customerName: customer.name,
    phone: customer.phone,
    creditLimit,
    creditDays: customer.creditDays ?? 30,
    groupId: customer.groupId,
    groupName,
    groupCreditLimit,
    groupTotalExposure,
    grossReceivables,
    availableCredits,
    netExposure,
    oldestOverdueDate,
    maxDaysOverdue,
    isOverdue,
    isLimitExceeded,
    buckets,
    openInvoices,
  };
}
