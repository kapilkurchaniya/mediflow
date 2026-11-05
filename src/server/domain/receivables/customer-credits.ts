import { db, schema, type DbOrTx } from "@/server/db";
import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { CustomerCredits, ReportStoreScope } from "./types";

export function buildPaymentsStoreScopeCondition(storeScope: ReportStoreScope): SQL {
  if (storeScope.type === "store") {
    return eq(schema.payments.storeId, storeScope.storeId);
  }
  if (storeScope.type === "unallocated") {
    return isNull(schema.payments.storeId);
  }
  return sql`TRUE`;
}

/**
 * Computes unallocated customer advances and available credit balances.
 * An advance exists when a customer payment receipt exceeds the total allocated to specific bills.
 */
export async function getCustomerAvailableCredits(
  tenantId: string,
  customerId: string,
  storeScope: ReportStoreScope,
  d: DbOrTx = db,
): Promise<CustomerCredits> {
  const storeCond = buildPaymentsStoreScopeCondition(storeScope);

  // 1. Total Customer Receipts (Direction: 'in')
  const [receiptRes] = await d
    .select({
      totalReceived: sql<number>`coalesce(sum(${schema.payments.amount}), 0)::bigint`,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.tenantId, tenantId),
        eq(schema.payments.partyType, "customer"),
        eq(schema.payments.partyId, customerId),
        eq(schema.payments.direction, "in"),
        storeCond,
      ),
    );

  const totalReceived = Number(receiptRes?.totalReceived ?? 0);

  // 2. Total Allocations applied to bills from these receipts
  const [allocRes] = await d
    .select({
      totalAllocated: sql<number>`coalesce(sum(${schema.paymentAllocations.amount}), 0)::bigint`,
    })
    .from(schema.paymentAllocations)
    .innerJoin(schema.payments, eq(schema.paymentAllocations.paymentId, schema.payments.id))
    .where(
      and(
        eq(schema.paymentAllocations.tenantId, tenantId),
        eq(schema.payments.partyType, "customer"),
        eq(schema.payments.partyId, customerId),
        eq(schema.payments.direction, "in"),
        storeCond,
      ),
    );

  const totalAllocated = Number(allocRes?.totalAllocated ?? 0);
  const unallocatedAdvances = Math.max(0, totalReceived - totalAllocated);

  // 3. Unallocated Credit Notes
  // Sale returns issued as 'credit_note' where the sale was not credit or where the credit was refunded as customer balance
  // In MediFlow, returnSale posts Dr Sales/Tax, Cr Debtors for refundMethod 'credit_note'.
  // If the customer has unlinked credit returns, they increase available credit.
  const unallocatedCreditNotes = 0; // In standard MediFlow flow, returns are directly linked to sales

  const totalAvailableCredits = unallocatedAdvances + unallocatedCreditNotes;

  return {
    unallocatedAdvances,
    unallocatedCreditNotes,
    totalAvailableCredits,
  };
}
