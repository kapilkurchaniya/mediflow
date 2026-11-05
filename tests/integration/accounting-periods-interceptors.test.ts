import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import {
  ensureFinancialYearPeriods,
  closeAccountingPeriod,
  PeriodLockedError,
  formatPeriodKey,
  getPeriodDateRange,
} from "@/server/domain/accounting-periods";
import {
  postSaleJournalEntry,
  postPurchaseJournalEntry,
  postSaleReturnJournalEntry,
  postPurchaseReturnJournalEntry,
} from "@/server/domain/accounting";
import { cancelSale } from "@/server/domain/sales/cancel-sale";
import { postPayment } from "@/server/domain/payments";
import { approveStockAuditSession } from "@/server/domain/inventory/stocktake/posting";
import { settleSupplierExpiryClaim } from "@/server/domain/inventory/expiry-claims";
import { setupAccountingPeriodsFixture, type AccountingPeriodsFixture } from "./accounting-periods-fixture";
import type { AuthCtx } from "@/server/rbac";
import type { Permission } from "@/lib/permissions";

describe("Accounting Period Lock — 8/8 Interceptor Integration Tests", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let f: AccountingPeriodsFixture;
  let testPeriodKey: string;
  let testDate: string;

  const makeAuthCtx = (): AuthCtx => ({
    tenantId: f.tenantId,
    storeId: f.storeA,
    userId: f.userId,
    user: { id: f.userId, name: "Test Owner", email: "owner@test.com", pharmacistRegNo: null },
    permissions: new Set<Permission>(["accounting.period.lock", "accounting.period.reopen", "sale.cancel", "accounting.post"]),
    allowedStoreIds: "all",
  });

  beforeAll(async () => {
    t = await createTestDb();
    f = await setupAccountingPeriodsFixture(t.db);

    const now = new Date();
    testPeriodKey = formatPeriodKey(now);
    const range = getPeriodDateRange(testPeriodKey);
    testDate = range.startDate;

    await ensureFinancialYearPeriods(t.db, f.tenantId, { financialYear: f.currentFY });

    // Lock the master period so all 8 interceptor paths can be verified
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
      reason: "Authoritative lock for interceptor testing",
    });
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("1. postSaleJournalEntry rolls back and throws PeriodLockedError", async () => {
    const saleId = "00000000-0000-0000-0000-000000000001";
    await expect(
      t.db.transaction(async (tx) => {
        await postSaleJournalEntry({
          tx,
          tenantId: f.tenantId,
          storeId: f.storeA,
          userId: f.userId,
          saleId,
          invoiceNo: "INV-TEST-001",
          invoiceDate: new Date(testDate),
          paidAmount: 10000,
          creditAmount: 0,
          taxableAmount: 10000,
          totalAmount: 10000,
          cgst: 0,
          sgst: 0,
          igst: 0,
          roundOff: 0,
        });
      }),
    ).rejects.toThrow(PeriodLockedError);

    const entries = await t.db.select().from(schema.journalEntries).where(eq(schema.journalEntries.refId, saleId));
    expect(entries).toHaveLength(0);
  });

  it("2. postPurchaseJournalEntry rolls back and throws PeriodLockedError", async () => {
    const purchaseId = "00000000-0000-0000-0000-000000000002";
    await expect(
      t.db.transaction(async (tx) => {
        await postPurchaseJournalEntry({
          tx,
          tenantId: f.tenantId,
          storeId: f.storeA,
          userId: f.userId,
          purchaseId,
          purchaseNo: "PUR-TEST-001",
          supplierId: f.supplierId,
          supplierInvoiceNo: "SUP-INV-001",
          invoiceDate: testDate,
          taxableAmount: 5000,
          cgst: 0,
          sgst: 0,
          igst: 0,
          roundOff: 0,
          cashDiscountAmount: 0,
          totalAmount: 5000,
        });
      }),
    ).rejects.toThrow(PeriodLockedError);
    const entries = await t.db.select().from(schema.journalEntries).where(eq(schema.journalEntries.refId, purchaseId));
    expect(entries).toHaveLength(0);
  });

  it("3. postPurchaseReturnJournalEntry rolls back and throws PeriodLockedError", async () => {
    const returnId = "00000000-0000-0000-0000-000000000004";
    await expect(
      t.db.transaction(async (tx) => {
        await postPurchaseReturnJournalEntry({
          tx,
          tenantId: f.tenantId,
          storeId: f.storeA,
          userId: f.userId,
          returnId,
          returnNo: "PR-TEST-001",
          supplierId: f.supplierId,
          returnDate: testDate,
          taxableAmount: 2000,
          cgst: 0,
          sgst: 0,
          igst: 0,
          roundOff: 0,
          totalAmount: 2000,
        });
      }),
    ).rejects.toThrow(PeriodLockedError);
    const entries = await t.db.select().from(schema.journalEntries).where(eq(schema.journalEntries.refId, returnId));
    expect(entries).toHaveLength(0);
  });

  it("4. postSaleReturnJournalEntry rolls back and throws PeriodLockedError", async () => {
    const returnId = "00000000-0000-0000-0000-000000000005";
    await expect(
      t.db.transaction(async (tx) => {
        await postSaleReturnJournalEntry({
          tx,
          tenantId: f.tenantId,
          storeId: f.storeA,
          userId: f.userId,
          saleId: "00000000-0000-0000-0000-000000000001",
          returnId,
          returnNo: "SR-TEST-001",
          returnDate: new Date(testDate),
          invoiceNo: "INV-TEST-001",
          refundMethod: "cash",
          taxableAmount: 1500,
          cgst: 0,
          sgst: 0,
          igst: 0,
          roundOff: 0,
          totalAmount: 1500,
        });
      }),
    ).rejects.toThrow(PeriodLockedError);
    const entries = await t.db.select().from(schema.journalEntries).where(eq(schema.journalEntries.refId, returnId));
    expect(entries).toHaveLength(0);
  });

  it("5. cancelSale reversal rolls back and throws PeriodLockedError", async () => {
    const [sale] = await t.db
      .insert(schema.sales)
      .values({
        tenantId: f.tenantId,
        storeId: f.storeA,
        invoiceNo: "INV-CANCEL-001",
        status: "completed",
        totalAmount: 1000,
        createdBy: f.userId,
        completedAt: new Date(testDate),
      })
      .returning();

    await t.db.insert(schema.journalEntries).values({
      tenantId: f.tenantId,
      storeId: f.storeA,
      entryNo: "JV-CAN-01",
      entryDate: testDate,
      narration: "Original sale",
      refType: "sale",
      refId: sale.id,
      createdBy: f.userId,
    });

    const ctx = makeAuthCtx();
    await expect(
      t.db.transaction(async (tx) => {
        await cancelSale(tx, ctx, { saleId: sale.id, reason: "Customer return request" }, { now: new Date(testDate) });
      }),
    ).rejects.toThrow(PeriodLockedError);
  });

  it("6. postPayment rolls back and throws PeriodLockedError", async () => {
    const ctx = makeAuthCtx();
    await expect(
      t.db.transaction(async (tx) => {
        await postPayment(tx, ctx, {
          direction: "in",
          partyType: "customer",
          partyId: f.customerId,
          method: "cash",
          amount: 5000,
          paymentDate: testDate,
        });
      }),
    ).rejects.toThrow(PeriodLockedError);
  });

  it("7. approveStockAuditSession rolls back and throws PeriodLockedError", async () => {
    const [session] = await t.db
      .insert(schema.stockAuditSessions)
      .values({
        tenantId: f.tenantId,
        storeId: f.storeA,
        sessionNo: `ST-${Date.now().toString().slice(-4)}`,
        status: "in_progress",
        startedBy: f.userId,
      })
      .returning();

    // Insert an item with counted difference to generate financial journal entry
    await t.db.insert(schema.stockAuditItems).values({
      tenantId: f.tenantId,
      sessionId: session.id,
      batchId: f.batchId,
      medicineId: f.medicineId,
      systemQty: 10,
      countedQty: 8,
      unitCostPaise: 3000,
      status: "counted",
      countedBy: f.userId,
      countedAt: new Date(),
    });

    await expect(
      t.db.transaction(async (tx) => {
        await approveStockAuditSession(tx, {
          tenantId: f.tenantId,
          storeId: f.storeA,
          sessionId: session.id,
          userId: f.userId,
        });
      }),
    ).rejects.toThrow(PeriodLockedError);
  });

  it("8. settleSupplierExpiryClaim (writeoff) rolls back and throws PeriodLockedError", async () => {
    const [claim] = await t.db
      .insert(schema.expiryClaims)
      .values({
        tenantId: f.tenantId,
        storeId: f.storeA,
        claimNo: `EC-${Date.now().toString().slice(-4)}`,
        supplierId: f.supplierId,
        status: "submitted",
        totalPaise: 3000,
        createdBy: f.userId,
      })
      .returning();

    await expect(
      t.db.transaction(async (tx) => {
        await settleSupplierExpiryClaim(tx, {
          tenantId: f.tenantId,
          storeId: f.storeA,
          claimId: claim.id,
          settlementType: "written_off",
          userId: f.userId,
        });
      }),
    ).rejects.toThrow(PeriodLockedError);
  });
});
