import { expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { testDb } from "./offline-fixture";
import * as schema from "../../../src/server/db/schema";

export type Sale = typeof schema.sales.$inferSelect;
export type StockConflictCase = typeof schema.stockConflictCases.$inferSelect;
export type StockConflictContribution = typeof schema.stockConflictContributions.$inferSelect;

/**
 * Asserts that the specified offline sale was synchronized and durably persisted on PostgreSQL.
 */
export async function assertServerSaleDetails(params: {
  invoiceNo: string;
  expectedPaymentMethods?: string[];
  expectedMinItems?: number;
}): Promise<Sale> {
  let sale: Sale | undefined;
  await expect.poll(async () => {
    const [row] = await testDb
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.invoiceNo, params.invoiceNo))
      .limit(1);
    sale = row;
    return Boolean(row);
  }, { timeout: 15000, message: `Expected server sale for ${params.invoiceNo}` }).toBe(true);

  expect(sale).toBeDefined();
  expect(sale!.status).toBe("completed");
  expect(sale!.invoiceNo).toBe(params.invoiceNo);
  expect(sale!.totalAmount).toBeGreaterThan(0);

  // Assert line items
  const items = await testDb
    .select()
    .from(schema.saleItems)
    .where(eq(schema.saleItems.saleId, sale!.id));

  expect(items.length).toBeGreaterThanOrEqual(params.expectedMinItems ?? 1);
  for (const item of items) {
    expect(item.qty).toBeGreaterThan(0);
    expect(item.rate).toBeGreaterThan(0);
    expect(item.batchId).toBeDefined();
  }

  // Assert payments
  const payments = await testDb
    .select()
    .from(schema.salePayments)
    .where(eq(schema.salePayments.saleId, sale!.id));

  expect(payments.length).toBeGreaterThan(0);
  if (params.expectedPaymentMethods) {
    const methods = payments.map((p) => p.method);
    for (const expectedMethod of params.expectedPaymentMethods) {
      expect(methods).toContain(expectedMethod);
    }
  }

  // Assert stock movements
  const movements = await testDb
    .select()
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.refId, sale!.id));

  expect(movements.length).toBe(items.length);
  for (const m of movements) {
    expect(m.type).toBe("sale");
    expect(m.qtyChange).toBeLessThan(0);
  }

  return sale!;
}

/**
 * Asserts that a multi-device stock conflict was correctly recognized and recorded.
 */
export async function assertServerConflictCase(params: {
  storeId: string;
  invoiceNo: string;
  expectedDeficit: number;
}): Promise<{ caseRow: StockConflictCase; contribution: StockConflictContribution }> {
  // 1. Locate contribution by invoiceNo (poll until PostgreSQL sync transaction commits)
  let contribution: StockConflictContribution | undefined;
  await expect.poll(async () => {
    const [row] = await testDb
      .select()
      .from(schema.stockConflictContributions)
      .where(eq(schema.stockConflictContributions.invoiceNo, params.invoiceNo))
      .limit(1);
    contribution = row;
    return Boolean(row);
  }, { timeout: 15000, message: `Expected conflict contribution for invoice ${params.invoiceNo}` }).toBe(true);

  expect(contribution).toBeDefined();
  expect(contribution!.contributedQty).toBe(params.expectedDeficit);

  // 2. Locate parent conflict case
  let caseRow: StockConflictCase | undefined;
  await expect.poll(async () => {
    const [row] = await testDb
      .select()
      .from(schema.stockConflictCases)
      .where(eq(schema.stockConflictCases.id, contribution!.conflictCaseId))
      .limit(1);
    caseRow = row;
    return Boolean(row);
  }, { timeout: 15000 }).toBe(true);

  expect(caseRow).toBeDefined();
  expect(caseRow!.storeId).toBe(params.storeId);
  expect(caseRow!.status).toBe("open");
  expect(caseRow!.requiredReconciliationQty).toBeGreaterThanOrEqual(params.expectedDeficit);

  return { caseRow: caseRow!, contribution: contribution! };
}

/**
 * Asserts that the idempotency key was recorded on the server for the given clientSaleId.
 */
export async function assertIdempotentKeyRecorded(clientSaleId: string): Promise<void> {
  const [idem] = await testDb
    .select()
    .from(schema.idempotencyKeys)
    .where(
      and(
        eq(schema.idempotencyKeys.scope, "sync.sale"),
        eq(schema.idempotencyKeys.key, clientSaleId),
      ),
    )
    .limit(1);

  expect(idem).toBeDefined();
}
