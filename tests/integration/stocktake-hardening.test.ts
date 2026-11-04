import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { makeBatch, makeMedicine, makeStore, makeTenant, makeUser } from "../setup/factories";
import {
  createStockAuditSession,
  recordStockAuditCounts,
  approveStockAuditSession,
  getStockAuditSessionDetails,
} from "@/server/domain/inventory/stocktake";

vi.mock("@/server/auth", () => ({
  requireAuth: async () => { throw new Error("not used"); },
  getCurrentSession: async () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.cleanup();
});

describe("Task A3.6 Hardening: Idempotency & Blind Protection", () => {
  it("enforces approval idempotency without duplicate stock movements or journal entries", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id, { name: "Retail Branch", code: "RET-2" });
    const user = await makeUser(t.db);

    const med = await makeMedicine(t.db, tenant.id, { name: "Metformin 500", rackId: null });
    const batch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      medicineId: med.id,
      batchNo: "MF-001",
      qtyOnHand: 50,
      purchaseRate: 2000,
    });

    const sessionRes = await t.db.transaction(async (tx) => {
      return createStockAuditSession(tx, {
        tenantId: tenant.id,
        storeId: store.id,
        scope: "full_store",
        userId: user.id,
      });
    });

    const details = await getStockAuditSessionDetails(t.db, { tenantId: tenant.id, sessionId: sessionRes.sessionId });
    await t.db.transaction(async (tx) => {
      await recordStockAuditCounts(tx, {
        tenantId: tenant.id,
        sessionId: sessionRes.sessionId,
        counts: [{ itemId: details!.items[0].id, countedQty: 45 }],
        userId: user.id,
      });
    });

    // First approval
    const firstRes = await t.db.transaction(async (tx) => {
      return approveStockAuditSession(tx, {
        tenantId: tenant.id,
        storeId: store.id,
        sessionId: sessionRes.sessionId,
        userId: user.id,
      });
    });
    expect(firstRes.status).toBe("approved");
    expect(firstRes.reconciledAdjustmentsCount).toBe(1);

    // Second approval (idempotent retry)
    const secondRes = await t.db.transaction(async (tx) => {
      return approveStockAuditSession(tx, {
        tenantId: tenant.id,
        storeId: store.id,
        sessionId: sessionRes.sessionId,
        userId: user.id,
      });
    });
    expect(secondRes.status).toBe("approved");
    expect(secondRes.reconciledAdjustmentsCount).toBe(0);

    // Verify stock was not adjusted twice
    const [b] = await t.db.select().from(schema.batches).where(eq(schema.batches.id, batch.id));
    expect(b.qtyOnHand).toBe(45);
  });

  it("enforces strict blind-mode data protection for counters before and after submitting counts", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id, { name: "Retail Branch", code: "RET-3" });
    const user = await makeUser(t.db);

    const med = await makeMedicine(t.db, tenant.id, { name: "Thyroxine 100", rackId: null });
    await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      medicineId: med.id,
      batchNo: "TH-101",
      qtyOnHand: 75,
      purchaseRate: 1500,
    });

    const sessionRes = await t.db.transaction(async (tx) => {
      return createStockAuditSession(tx, {
        tenantId: tenant.id,
        storeId: store.id,
        scope: "full_store",
        blindCount: true,
        userId: user.id,
      });
    });

    // 1. Blind staff view before count: systemQty and varianceQty are null
    const staffViewBefore = await getStockAuditSessionDetails(t.db, {
      tenantId: tenant.id,
      sessionId: sessionRes.sessionId,
      isBlindStaffView: true,
    });
    expect(staffViewBefore!.items[0].systemQty).toBeNull();
    expect(staffViewBefore!.items[0].varianceQty).toBeNull();

    // 2. Submit count
    await t.db.transaction(async (tx) => {
      await recordStockAuditCounts(tx, {
        tenantId: tenant.id,
        sessionId: sessionRes.sessionId,
        counts: [{ itemId: staffViewBefore!.items[0].id, countedQty: 75 }],
        userId: user.id,
      });
    });

    // 3. Blind staff view AFTER count: systemQty and varianceQty REMAIN null to prevent count tampering
    const staffViewAfter = await getStockAuditSessionDetails(t.db, {
      tenantId: tenant.id,
      sessionId: sessionRes.sessionId,
      isBlindStaffView: true,
    });
    expect(staffViewAfter!.items[0].countedQty).toBe(75);
    expect(staffViewAfter!.items[0].systemQty).toBeNull();
    expect(staffViewAfter!.items[0].varianceQty).toBeNull();

    // 4. Manager view: reveals systemQty and varianceQty
    const managerView = await getStockAuditSessionDetails(t.db, {
      tenantId: tenant.id,
      sessionId: sessionRes.sessionId,
      isBlindStaffView: false,
    });
    expect(managerView!.items[0].systemQty).toBe(75);
    expect(managerView!.items[0].varianceQty).toBe(0);
  });
});
