import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { seedSystemRoles } from "@/server/roles";
import { createTestDb } from "../setup/db";
import { makeStore, makeTenant, makeUser } from "../setup/factories";
import { getOrSeedAccounts } from "@/server/domain/accounting";
import {
  recordExpense,
  createExpenseAccount,
  listExpensePayments,
  getExpenseSummaryStats,
} from "@/server/domain/expenses";
import { openShift, computeExpectedCash } from "@/server/domain/cash-sessions";
import type { AuthCtx } from "@/server/rbac";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

const today = new Date().toISOString().slice(0, 10);

async function setupScene(roleKey = "owner") {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id);
  const user = await makeUser(t.db, { name: "Ramesh Pharmacist" });
  const roleIds = await seedSystemRoles(t.db, tenant.id);
  await t.db.insert(schema.memberships).values({
    tenantId: tenant.id,
    userId: user.id,
    roleId: roleIds[roleKey],
  });

  const ctx: AuthCtx = {
    tenantId: tenant.id,
    storeId: store.id,
    userId: user.id,
    user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: null },
    permissions: new Set(ALL_PERMISSIONS) as AuthCtx["permissions"],
    allowedStoreIds: "all",
  };

  const accountMap = await getOrSeedAccounts(t.db, tenant.id);
  return { tenant, store, user, ctx, accountMap };
}

describe("Task A5.1 - Expenses Integration Tests", () => {
  it("records cash till payout, creates balanced journal, and reconciles cash register shift", async () => {
    const { ctx, accountMap } = await setupScene();

    // 1. Open a cash shift with ₹2,000 opening float (200,000 paise)
    const session = await t.db.transaction((tx) => openShift(tx, ctx, { openingCash: 200000 }));

    // 2. Record an expense paid from the till (₹350 Stationery = 35,000 paise)
    const opId = crypto.randomUUID();
    const result = await t.db.transaction((tx) =>
      recordExpense(tx, ctx, {
        clientOperationId: opId,
        expenseAccountId: accountMap.expense_stationery,
        amount: 35000,
        method: "cash",
        paidFromTill: true,
        paymentDate: today,
        payeeName: "Local Book Depot",
        vendorInvoiceNo: "STAT-001",
        note: "Thermal printer paper rolls",
      }),
    );

    expect(result.paymentNo).toMatch(/^PAY/);

    // 3. Verify payments row
    const [payRow] = await t.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, result.paymentId));
    expect(payRow.paidFromTill).toBe(true);
    expect(payRow.cashSessionId).toBe(session.id);
    expect(payRow.amount).toBe(35000);
    expect(payRow.payeeName).toBe("Local Book Depot");

    // 4. Verify immutable cash_movements ledger
    const [movement] = await t.db
      .select()
      .from(schema.cashMovements)
      .where(eq(schema.cashMovements.paymentId, result.paymentId));
    expect(movement).toBeDefined();
    expect(movement.amount).toBe(35000);
    expect(movement.movementType).toBe("cash_payout");
    expect(movement.cashSessionId).toBe(session.id);

    // 5. Verify double-entry journal (Dr Stationery 4145, Cr Cash 1010)
    const lines = await t.db
      .select()
      .from(schema.journalLines)
      .where(eq(schema.journalLines.entryId, payRow.journalEntryId!));
    expect(lines).toHaveLength(2);
    const debitLine = lines.find((l) => l.debit > 0);
    const creditLine = lines.find((l) => l.credit > 0);
    expect(debitLine?.accountId).toBe(accountMap.expense_stationery);
    expect(debitLine?.debit).toBe(35000);
    expect(creditLine?.accountId).toBe(accountMap.cash);
    expect(creditLine?.credit).toBe(35000);

    // 6. Verify cash drawer reconciliation: expectedCash = 200,000 - 35,000 = 165,000 paise
    const stats = await computeExpectedCash(t.db, ctx, session.id);
    expect(stats.openingCash).toBe(200000);
    expect(stats.cashPayouts).toBe(35000);
    expect(stats.expectedCash).toBe(165000);
  });

  it("records office cash expense without deducting from active POS register drawer", async () => {
    const { ctx, accountMap } = await setupScene();

    // 1. Open shift with ₹1,000
    const session = await t.db.transaction((tx) => openShift(tx, ctx, { openingCash: 100000 }));

    // 2. Record office cash expense (paidFromTill: false)
    const opId = crypto.randomUUID();
    const result = await t.db.transaction((tx) =>
      recordExpense(tx, ctx, {
        clientOperationId: opId,
        expenseAccountId: accountMap.expense_rent,
        amount: 50000, // ₹500
        method: "cash",
        paidFromTill: false,
        paymentDate: today,
        payeeName: "Office Landlord",
      }),
    );

    const [payRow] = await t.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, result.paymentId));
    expect(payRow.paidFromTill).toBe(false);
    expect(payRow.cashSessionId).toBeNull();

    // 3. Verify no cash_movement created
    const movements = await t.db
      .select()
      .from(schema.cashMovements)
      .where(eq(schema.cashMovements.paymentId, result.paymentId));
    expect(movements).toHaveLength(0);

    // 4. Verify POS register drawer is NOT contaminated (expectedCash remains ₹1,000)
    const stats = await computeExpectedCash(t.db, ctx, session.id);
    expect(stats.cashPayouts).toBe(0);
    expect(stats.expectedCash).toBe(100000);
  });

  it("handles voucher idempotency replay and prevents duplicate journals", async () => {
    const { ctx, accountMap } = await setupScene();
    const opId = crypto.randomUUID();

    const payload = {
      clientOperationId: opId,
      expenseAccountId: accountMap.expense_utilities,
      amount: 45000,
      method: "bank" as const,
      paidFromTill: false,
      paymentDate: today,
      payeeName: "Electricity Board",
    };

    // First post
    const res1 = await t.db.transaction((tx) => recordExpense(tx, ctx, payload));
    expect(res1.isDuplicate).toBeFalsy();

    // Exact replay with same clientOperationId
    const res2 = await t.db.transaction((tx) => recordExpense(tx, ctx, payload));
    expect(res2.isDuplicate).toBe(true);
    expect(res2.paymentId).toBe(res1.paymentId);
    expect(res2.paymentNo).toBe(res1.paymentNo);

    // Check count in database: exactly 1 payment
    const count = await t.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.clientOperationId, opId));
    expect(count).toHaveLength(1);

    // Mutation replay with different amount should throw IDEMPOTENCY_CONFLICT
    await expect(
      t.db.transaction((tx) =>
        recordExpense(tx, ctx, {
          ...payload,
          amount: 99000,
        }),
      ),
    ).rejects.toThrow(/operation ID already exists with different details/);
  });

  it("allocates custom category codes in 4160-4199 range and enforces uniqueness", async () => {
    const { ctx } = await setupScene();

    const cat1 = await createExpenseAccount(t.db, ctx, { name: "Courier & Parcel" });
    expect(cat1.code).toBe("4160");
    expect(cat1.type).toBe("expense");

    const cat2 = await createExpenseAccount(t.db, ctx, { name: "Tea & Refreshments" });
    expect(cat2.code).toBe("4161");

    // Duplicate name rejection
    await expect(
      createExpenseAccount(t.db, ctx, { name: "Courier & Parcel" }),
    ).rejects.toThrow(/already exists/);
  });

  it("enforces strict store-scoping and chain-wide report permissions", async () => {
    const { tenant, ctx, accountMap } = await setupScene();
    const store2 = await makeStore(t.db, tenant.id);

    // Record expense in Store 1
    await t.db.transaction((tx) =>
      recordExpense(tx, ctx, {
        clientOperationId: crypto.randomUUID(),
        expenseAccountId: accountMap.expense_misc,
        amount: 2500,
        method: "cash",
        paidFromTill: false,
        paymentDate: today,
      }),
    );

    // Record expense in Store 2
    const ctxStore2: AuthCtx = { ...ctx, storeId: store2.id };
    await t.db.transaction((tx) =>
      recordExpense(tx, ctxStore2, {
        clientOperationId: crypto.randomUUID(),
        expenseAccountId: accountMap.expense_misc,
        amount: 7500,
        method: "cash",
        paidFromTill: false,
        paymentDate: today,
      }),
    );

    // Store 1 query without cross-store permission
    const scopedList = await listExpensePayments(t.db, ctx, { canViewAllStores: false });
    expect(scopedList.items).toHaveLength(1);
    expect(scopedList.items[0].amount).toBe(2500);

    // Cross-store query with report.all_stores
    const allStoresList = await listExpensePayments(t.db, ctx, { canViewAllStores: true });
    expect(allStoresList.items).toHaveLength(2);

    // Summary stats store-scoping
    const scopedStats = await getExpenseSummaryStats(t.db, ctx, { canViewAllStores: false });
    expect(scopedStats.totalExpenses).toBe(2500);

    const allStats = await getExpenseSummaryStats(t.db, ctx, { canViewAllStores: true });
    expect(allStats.totalExpenses).toBe(10000);
  });

  it("rejects till payout when no cash register shift is open", async () => {
    const { ctx, accountMap } = await setupScene();

    // Ensure no shift is open
    await expect(
      t.db.transaction((tx) =>
        recordExpense(tx, ctx, {
          clientOperationId: crypto.randomUUID(),
          expenseAccountId: accountMap.expense_transport,
          amount: 10000,
          method: "cash",
          paidFromTill: true,
          paymentDate: today,
        }),
      ),
    ).rejects.toThrow(/Active cash register shift required/);
  });
});
