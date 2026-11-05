import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../setup/db";
import * as schema from "@/server/db/schema";
import { AccountingInvariantsOracle } from "./accounting-invariants-oracle";
import {
  mulberry32,
  setupInvariantsRunner,
  executeRunnerStep,
} from "./accounting-invariants-runner";
import {
  postCustomerOpeningBalance,
  postSupplierOpeningBalance,
  postGeneralLedgerOpeningBalance,
  captureOpeningInventorySnapshot,
  postInventorySnapshotJournal,
} from "@/server/domain/accounting-opening-balances";
import { PeriodLockedError } from "@/server/domain/accounting-periods";
import { DomainError } from "@/server/errors";

describe("Accounting Invariants & Opening Balances Integration Suite", () => {
  let t: { db: TestDb; cleanup: () => Promise<void> };

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("1. 200+ operation randomized scenario runner preserves all invariants across checkpoints", async () => {
    const ctx = await setupInvariantsRunner(t.db);
    const oracle = new AccountingInvariantsOracle(t.db, ctx.fixture.tenantId);
    const rng = mulberry32(42);

    const counts: Record<string, number> = {};
    const totalOps = 200;

    for (let i = 1; i <= totalOps; i++) {
      const op = await executeRunnerStep(t.db, ctx, i, rng);
      counts[op] = (counts[op] || 0) + 1;

      // Assert invariants at intermediate checkpoints every 25 operations
      if (i % 25 === 0) {
        const jRes = await oracle.assertJournalDoubleEntryInvariant();
        expect(jRes.violations).toHaveLength(0);

        const tbRes = await oracle.assertTrialBalanceZeroInvariant();
        expect(tbRes.diff).toBe(0);

        const bRes = await oracle.assertBatchMovementIntegrityInvariant();
        expect(bRes.violations).toHaveLength(0);
      }
    }

    // Final end-of-suite full oracle assertions
    const finalJournals = await oracle.assertJournalDoubleEntryInvariant();
    expect(finalJournals.violations).toHaveLength(0);
    expect(finalJournals.totalJournals).toBeGreaterThan(50);

    const finalTrialBalance = await oracle.assertTrialBalanceZeroInvariant();
    expect(finalTrialBalance.diff).toBe(0);

    const finalBatches = await oracle.assertBatchMovementIntegrityInvariant();
    expect(finalBatches.violations).toHaveLength(0);
  });

  it("2. Seed reproducibility: identical seeds produce identical operation sequences", async () => {
    const runSequence = (seed: number) => {
      const rng = mulberry32(seed);
      return Array.from({ length: 50 }, () => Math.floor(rng() * 10));
    };

    const seqA = runSequence(1337);
    const seqB = runSequence(1337);
    expect(seqA).toEqual(seqB);

    const seqDifferent = runSequence(9999);
    expect(seqA).not.toEqual(seqDifferent);
  });

  it("3. Opening balances idempotency (E1) and payload hash conflict (E2)", async () => {
    const ctx = await setupInvariantsRunner(t.db);
    const f = ctx.fixture;
    const date = "2026-05-01";

    // First post
    const res1 = await postCustomerOpeningBalance(t.db, {
      tenantId: f.tenantId,
      customerId: f.customerId,
      storeId: f.storeA,
      asOfDate: date,
      amountPaise: 10000,
      userId: f.userId,
    });
    expect(res1.status).toBe("posted");

    // E1: Idempotent replay with identical payload returns existing record
    const res2 = await postCustomerOpeningBalance(t.db, {
      tenantId: f.tenantId,
      customerId: f.customerId,
      storeId: f.storeA,
      asOfDate: date,
      amountPaise: 10000,
      userId: f.userId,
    });
    expect(res2.recordId).toBe(res1.recordId);

    // E2: Conflict replay with different amount for same customer on same date throws 409
    await expect(
      postCustomerOpeningBalance(t.db, {
        tenantId: f.tenantId,
        customerId: f.customerId,
        storeId: f.storeA,
        asOfDate: date,
        amountPaise: 25000,
        userId: f.userId,
      }),
    ).rejects.toThrow(/Conflict: Opening balance already posted/);
  });

  it("4. GL opening balance rejects control accounts (E9) and respects closed periods (E8)", async () => {
    const ctx = await setupInvariantsRunner(t.db);
    const f = ctx.fixture;

    // E9: Reject control accounts (1050 Debtors, 2010 Creditors, 1080 Stock)
    const controlAccounts = [f.accounts.debtors, f.accounts.creditors, f.accounts.inventory];
    for (const accountId of controlAccounts) {
      await expect(
        postGeneralLedgerOpeningBalance(t.db, {
          tenantId: f.tenantId,
          accountId,
          asOfDate: "2026-05-01",
          amountPaise: 5000,
          direction: "debit",
          narration: "Direct opening balance test",
          userId: f.userId,
        }),
      ).rejects.toThrow(/prohibited/);
    }

    // E8: Reject posting into closed period
    await t.db.insert(schema.accountingPeriods).values({
      tenantId: f.tenantId,
      periodKey: "2026-04",
      financialYear: "2026-2027",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      status: "locked",
      lockedAt: new Date(),
      lockedBy: f.userId,
      lockNote: "Audited period closed",
    });

    await expect(
      postCustomerOpeningBalance(t.db, {
        tenantId: f.tenantId,
        customerId: f.customerId,
        asOfDate: "2026-04-15",
        amountPaise: 5000,
        userId: f.userId,
      }),
    ).rejects.toThrow(PeriodLockedError);
  });

  it("5. Opening inventory cutover snapshot immutability (E6) & Stock Valuation Invariant 5", async () => {
    const ctx = await setupInvariantsRunner(t.db);
    const f = ctx.fixture;
    const oracle = new AccountingInvariantsOracle(t.db, f.tenantId);

    // Capture snapshot for Store A as of cutover date
    const snap = await captureOpeningInventorySnapshot(t.db, {
      tenantId: f.tenantId,
      storeId: f.storeA,
      asOfDate: "2026-05-01",
      userId: f.userId,
    });
    expect(snap.status).toBe("captured");
    expect(snap.totalValuePaise).toBeGreaterThan(0);

    // Post financial journal (Dr 1080 / Cr 3999)
    const posted = await postInventorySnapshotJournal(t.db, {
      tenantId: f.tenantId,
      snapshotId: snap.snapshotId,
      userId: f.userId,
    });
    expect(posted.status).toBe("posted");

    // Assert Invariant 5: GL 1080 equals snapshot valuation
    const stockVal = await oracle.assertStockValuationPeriodicInvariant(f.storeA);
    expect(stockVal.gl1080Balance).toBe(snap.totalValuePaise);

    // E6: Later operations (Day 2 sale) do not change the cutover snapshot row
    const [snapshotBefore] = await t.db
      .select()
      .from(schema.openingInventorySnapshots)
      .where(eq(schema.openingInventorySnapshots.id, snap.snapshotId));

    // Execute day 2 cash sale
    await executeRunnerStep(t.db, ctx, 999, mulberry32(1));

    const [snapshotAfter] = await t.db
      .select()
      .from(schema.openingInventorySnapshots)
      .where(eq(schema.openingInventorySnapshots.id, snap.snapshotId));

    expect(snapshotAfter.totalValuePaise).toBe(snapshotBefore.totalValuePaise);
  });

  it("6. Database constraint triggers enforce balanced entries (E4) and header guards (E5)", async () => {
    const ctx = await setupInvariantsRunner(t.db);
    const f = ctx.fixture;

    // E4: Direct insert of unbalanced journal lines fails trigger
    let errUnbalanced: unknown;
    try {
      await t.db.transaction(async (tx) => {
        const [entry] = await tx.insert(schema.journalEntries).values({
          tenantId: f.tenantId,
          storeId: f.storeA,
          entryNo: "JV-UNBALANCED",
          entryDate: "2026-05-01",
          narration: "Unbalanced manual test entry",
          createdBy: f.userId,
        }).returning();

        await tx.insert(schema.journalLines).values([
          { tenantId: f.tenantId, entryId: entry.id, accountId: f.accounts.cash, debit: 1000, credit: 0 },
          { tenantId: f.tenantId, entryId: entry.id, accountId: f.accounts.sales, debit: 0, credit: 500 },
        ]);
      });
    } catch (err) {
      errUnbalanced = err;
    }
    expect(errUnbalanced).toBeDefined();
    const e4 = errUnbalanced as { message?: string; cause?: { message?: string } };
    const fullMsgE4 = `${e4.message || ""} ${e4.cause?.message || ""}`;
    expect(fullMsgE4).toMatch(/unbalanced: debits=1000 credits=500/);

    // E5: Header guard fails on 1-line or 0-line committed journal entry
    let errSingleLine: unknown;
    try {
      await t.db.transaction(async (tx) => {
        const [entry] = await tx.insert(schema.journalEntries).values({
          tenantId: f.tenantId,
          storeId: f.storeA,
          entryNo: "JV-SINGLE-LINE",
          entryDate: "2026-05-01",
          narration: "Single line test",
          createdBy: f.userId,
        }).returning();

        await tx.insert(schema.journalLines).values([
          { tenantId: f.tenantId, entryId: entry.id, accountId: f.accounts.cash, debit: 1000, credit: 0 },
        ]);
      });
    } catch (err) {
      errSingleLine = err;
    }
    expect(errSingleLine).toBeDefined();
    const e5 = errSingleLine as { message?: string; cause?: { message?: string } };
    const fullMsgE5 = `${e5.message || ""} ${e5.cause?.message || ""}`;
    expect(fullMsgE5).toMatch(/must have at least 2 lines/);
  });

  it("7. Subledger reconciliation: Customer (1050) & Supplier (2010) (E7)", async () => {
    const ctx = await setupInvariantsRunner(t.db);
    const f = ctx.fixture;
    const oracle = new AccountingInvariantsOracle(t.db, f.tenantId);

    // Post Customer opening balance
    await postCustomerOpeningBalance(t.db, {
      tenantId: f.tenantId,
      customerId: f.customerId,
      asOfDate: "2026-05-01",
      amountPaise: 12500,
      userId: f.userId,
    });

    // Post Supplier opening balance
    await postSupplierOpeningBalance(t.db, {
      tenantId: f.tenantId,
      supplierId: f.supplierId,
      asOfDate: "2026-05-01",
      amountPaise: 8500,
      userId: f.userId,
    });

    const recon = await oracle.assertControlAccountsReconciliation();
    expect(recon.glDebtorsNet).toBe(12500);
    expect(recon.subledgerCustomerTotal).toBe(12500);
    expect(recon.glCreditorsNet).toBe(8500);
    expect(recon.subledgerSupplierTotal).toBe(8500);
  });
});
