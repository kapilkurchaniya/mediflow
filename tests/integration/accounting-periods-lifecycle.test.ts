import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import {
  ensureFinancialYearPeriods,
  assertAccountingPeriodOpen,
  closeAccountingPeriod,
  reopenAccountingPeriod,
  PeriodLockedError,
  formatPeriodKey,
  getPeriodDateRange,
} from "@/server/domain/accounting-periods";
import { setupAccountingPeriodsFixture, type AccountingPeriodsFixture } from "./accounting-periods-fixture";

describe("Accounting Period Lock — Lifecycle & Concurrency Integration Tests", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let f: AccountingPeriodsFixture;
  let testPeriodKey: string;
  let testDate: string;

  beforeAll(async () => {
    t = await createTestDb();
    f = await setupAccountingPeriodsFixture(t.db);

    const now = new Date();
    testPeriodKey = formatPeriodKey(now);
    const range = getPeriodDateRange(testPeriodKey);
    testDate = range.startDate;

    await ensureFinancialYearPeriods(t.db, f.tenantId, { financialYear: f.currentFY });
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  describe("Model A — Hierarchical Scope & Deterministic Order", () => {
    it("allows posting when master period is open and no GSTIN lock exists", async () => {
      const res = await assertAccountingPeriodOpen(t.db, {
        tenantId: f.tenantId,
        entryDate: testDate,
        storeId: f.storeA,
      });
      expect(res.masterPeriod.status).toBe("open");
      expect(res.gstinPeriod).toBeNull();
    });

    it("blocks posting across all stores when master period is locked", async () => {
      const [master] = await t.db
        .select()
        .from(schema.accountingPeriods)
        .where(
          and(
            eq(schema.accountingPeriods.tenantId, f.tenantId),
            eq(schema.accountingPeriods.periodKey, testPeriodKey),
            sql`${schema.accountingPeriods.gstin} IS NULL`,
          ),
        );

      await closeAccountingPeriod(t.db, {
        tenantId: f.tenantId,
        periodId: master.id,
        performedBy: f.userId,
        reason: "Master monthly audit closure",
      });

      await expect(
        assertAccountingPeriodOpen(t.db, { tenantId: f.tenantId, entryDate: testDate, storeId: f.storeA }),
      ).rejects.toThrow(PeriodLockedError);

      await expect(
        assertAccountingPeriodOpen(t.db, { tenantId: f.tenantId, entryDate: testDate, storeId: f.storeB }),
      ).rejects.toThrow(PeriodLockedError);

      await reopenAccountingPeriod(t.db, {
        tenantId: f.tenantId,
        periodId: master.id,
        performedBy: f.userId,
        reason: "Reopening master for secondary GSTIN tests",
      });
    });

    it("enforces secondary GSTIN lock without blocking unaffected stores", async () => {
      await ensureFinancialYearPeriods(t.db, f.tenantId, {
        financialYear: f.currentFY,
        gstin: f.gstinA,
      });

      const [secA] = await t.db
        .select()
        .from(schema.accountingPeriods)
        .where(
          and(
            eq(schema.accountingPeriods.tenantId, f.tenantId),
            eq(schema.accountingPeriods.periodKey, testPeriodKey),
            eq(schema.accountingPeriods.gstin, f.gstinA),
          ),
        );

      await closeAccountingPeriod(t.db, {
        tenantId: f.tenantId,
        periodId: secA.id,
        performedBy: f.userId,
        reason: "Locking Branch A GSTIN books",
      });

      await expect(
        assertAccountingPeriodOpen(t.db, { tenantId: f.tenantId, entryDate: testDate, storeId: f.storeA }),
      ).rejects.toThrow(PeriodLockedError);

      const resB = await assertAccountingPeriodOpen(t.db, { tenantId: f.tenantId, entryDate: testDate, storeId: f.storeB });
      expect(resB.masterPeriod.status).toBe("open");

      await reopenAccountingPeriod(t.db, {
        tenantId: f.tenantId,
        periodId: secA.id,
        performedBy: f.userId,
        reason: "Reopening Branch A GSTIN books",
      });
    });
  });

  describe("Append-Only Trigger & Immutability Integrity", () => {
    it("prohibits UPDATE and DELETE operations on accounting_period_events at database layer", async () => {
      const [event] = await t.db
        .select()
        .from(schema.accountingPeriodEvents)
        .where(eq(schema.accountingPeriodEvents.tenantId, f.tenantId))
        .limit(1);

      expect(event).toBeDefined();

      let updateBlocked = false;
      try {
        await t.db
          .update(schema.accountingPeriodEvents)
          .set({ reason: "Tampered" })
          .where(eq(schema.accountingPeriodEvents.id, event.id));
      } catch (err: unknown) {
        const fullMsg = `${(err as Error).message} ${(err as { cause?: { message?: string } })?.cause?.message ?? ""}`;
        if (fullMsg.includes("accounting_period_events is append-only")) {
          updateBlocked = true;
        }
      }
      expect(updateBlocked).toBe(true);

      let deleteBlocked = false;
      try {
        await t.db
          .delete(schema.accountingPeriodEvents)
          .where(eq(schema.accountingPeriodEvents.id, event.id));
      } catch (err: unknown) {
        const fullMsg = `${(err as Error).message} ${(err as { cause?: { message?: string } })?.cause?.message ?? ""}`;
        if (fullMsg.includes("accounting_period_events is append-only")) {
          deleteBlocked = true;
        }
      }
      expect(deleteBlocked).toBe(true);
    });

    it("verifies sequential event ordering across lock -> reopen -> re-close transitions", async () => {
      const [master] = await t.db
        .select()
        .from(schema.accountingPeriods)
        .where(
          and(
            eq(schema.accountingPeriods.tenantId, f.tenantId),
            eq(schema.accountingPeriods.periodKey, testPeriodKey),
            sql`${schema.accountingPeriods.gstin} IS NULL`,
          ),
        );

      const close1 = await closeAccountingPeriod(t.db, {
        tenantId: f.tenantId,
        periodId: master.id,
        performedBy: f.userId,
        reason: "Audited monthly close 1",
      });
      expect(close1.event.eventSequence).toBeGreaterThan(0);

      const reopen1 = await reopenAccountingPeriod(t.db, {
        tenantId: f.tenantId,
        periodId: master.id,
        performedBy: f.userId,
        reason: "Audit correction cycle 1",
      });
      expect(reopen1.event.eventSequence).toBe(close1.event.eventSequence + 1);

      const close2 = await closeAccountingPeriod(t.db, {
        tenantId: f.tenantId,
        periodId: master.id,
        performedBy: f.userId,
        reason: "Re-locking after correction",
      });
      expect(close2.event.eventSequence).toBe(reopen1.event.eventSequence + 1);
    });
  });
});
