import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { postPayment } from "@/server/domain/payments";
import type { AuthCtx } from "@/server/rbac";
import type { Permission } from "@/lib/permissions";
import {
  getReceivablesAgeingReport,
  getCustomerExposure,
  evaluateCreditSale,
  enqueuePaymentReminder,
  reconcileReceivablesWithControlAccount,
} from "@/server/domain/receivables";
import { setupReceivablesFixture, type ReceivablesFixture } from "./receivables-fixture";

describe("Receivables & Credit Control — Integration Tests", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let f: ReceivablesFixture;

  const makeAuthCtx = (perms: Permission[]): AuthCtx => ({
    tenantId: f.tenantId,
    storeId: f.storeA,
    userId: "00000000-0000-0000-0000-000000000001",
    user: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Test User",
      email: "test@example.com",
      pharmacistRegNo: null,
    },
    permissions: new Set(perms),
    allowedStoreIds: "all",
  });

  beforeAll(async () => {
    t = await createTestDb();
    f = await setupReceivablesFixture(t.db);
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  describe("Canonical Invoice Balances & Ageing Buckets", () => {
    it("reports Store A receivables accurately with correct overdue ageing", async () => {
      const report = await getReceivablesAgeingReport(
        f.tenantId,
        {
          mode: "due_date",
          storeScope: { type: "store", storeId: f.storeA },
        },
        t.db,
      );

      expect(report.totalCustomers).toBe(1);
      const c1 = report.customers[0];
      expect(c1?.customerName).toBe("Anand Verma");
      // Gross: ₹6,000 + ₹4,000 = ₹10,000
      expect(c1?.grossReceivables).toBe(1000000);
      expect(c1?.netExposure).toBe(1000000);
      // Sale 1: completed 40 days ago with 15 credit days = 25 days overdue (bucket: 1-30d)
      expect(c1?.buckets.days1to30).toBe(600000);
      // Sale 2: completed 5 days ago with 15 credit days = 10 days remaining (bucket: current)
      expect(c1?.buckets.current).toBe(400000);
    });

    it("shifts bucket placement when evaluated in Invoice-Date (bill age) mode", async () => {
      const report = await getReceivablesAgeingReport(
        f.tenantId,
        {
          mode: "invoice_date",
          storeScope: { type: "store", storeId: f.storeA },
        },
        t.db,
      );

      const c1 = report.customers[0];
      // In bill-age mode:
      // Sale 1 is 40 days old -> bucket: 31-60d (₹6,000)
      expect(c1?.buckets.days31to60).toBe(600000);
      // Sale 2 is 5 days old -> bucket: 1-30d (₹4,000)
      expect(c1?.buckets.days1to30).toBe(400000);
    });
  });

  describe("Payment Allocation & Advance Deductions", () => {
    it("deducts partial payment allocations from invoice open balance without double-counting", async () => {
      const authCtx = makeAuthCtx(["accounting.post"]);

      await t.db.transaction(async (tx) => {
        await postPayment(tx, authCtx, {
          direction: "in",
          partyType: "customer",
          partyId: f.customer1Id,
          method: "cash",
          amount: 200000,
          paymentDate: "2026-11-04",
          allocations: [{ refType: "sale", refId: f.sale1Id, amount: 200000 }],
        });
      });

      const exposure = await getCustomerExposure(
        f.tenantId,
        f.customer1Id,
        { type: "store", storeId: f.storeA },
        undefined,
        "due_date",
        t.db,
      );

      expect(exposure?.grossReceivables).toBe(800000); // 4,000 + 4,000
      expect(exposure?.availableCredits).toBe(0);
      expect(exposure?.netExposure).toBe(800000);
    });
  });

  describe("Pooled Family Group Exposure & Credit Policy", () => {
    it("evaluates pooled family exposure against customerGroups.creditLimit", async () => {
      const authCtx = makeAuthCtx(["customer.credit"]);

      // Rajesh Mehta already owes ₹12,000 in Store B. Group limit is ₹20,000.
      // Sunita Mehta (sister) tries to purchase ₹9,000 on credit. Total would be ₹21,000 (> ₹20,000 limit).
      const evalResult = await evaluateCreditSale(t.db, authCtx, {
        customerId: f.customer3Id,
        creditPaise: 900000,
      });

      expect(evalResult.allowed).toBe(false);
      expect(evalResult.code).toBe("CREDIT_LIMIT_EXCEEDED");
      expect(evalResult.isPooled).toBe(true);
      expect(evalResult.currentExposure).toBe(1200000); // from Rajesh's sale
      expect(evalResult.creditLimit).toBe(2000000); // group pooled limit
    });
  });

  describe("WhatsApp Payment Reminder Outbox", () => {
    it("enqueues a payment reminder event into schema.outboxEvents", async () => {
      const authCtx = makeAuthCtx(["accounting.view"]);

      const result = await enqueuePaymentReminder(t.db, authCtx, {
        customerId: f.customer1Id,
        phone: "9820011111",
      });

      expect(result.eventId).toBeDefined();

      const [outboxRow] = await t.db
        .select()
        .from(schema.outboxEvents)
        .where(eq(schema.outboxEvents.id, Number(result.eventId)));

      expect(outboxRow).toBeDefined();
      expect(outboxRow?.type).toBe("whatsapp.payment_reminder");
      expect(outboxRow?.status).toBe("pending");
      const payload = outboxRow?.payload as Record<string, unknown>;
      expect(payload?.customerId).toBe(f.customer1Id);
      expect(payload?.phone).toBe("9820011111");
      expect(payload?.totalDuePaise).toBe(800000);
    });
  });

  describe("Control Account Parity (1050)", () => {
    it("reconciles net receivables subledger against Debtors control account balance", async () => {
      const recon = await reconcileReceivablesWithControlAccount(
        f.tenantId,
        { type: "store", storeId: f.storeA },
        undefined,
        t.db,
      );

      // In Store A: Sale 1 (6,000 - 2,000 paid = 4,000) + Sale 2 (4,000) = 8,000
      expect(recon.netSubledgerReceivables).toBe(800000);
      expect(recon.debtorsControlAccountBalance).toBe(800000);
      expect(recon.variance).toBe(0);
      expect(recon.isReconciled).toBe(true);
    });
  });
});
