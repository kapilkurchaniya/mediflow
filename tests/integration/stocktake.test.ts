import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
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

describe("Task A3.6: Physical Stock Count & Rack Audits Integration", () => {
  it("enforces store-specific rack resolution and unassigned grouping in audit snapshots", async () => {
    const tenant = await makeTenant(t.db);
    const storeA = await makeStore(t.db, tenant.id, { name: "Branch A", code: "BR-A" });
    const storeB = await makeStore(t.db, tenant.id, { name: "Branch B", code: "BR-B" });
    const user = await makeUser(t.db);

    // Racks
    const [rackA] = await t.db
      .insert(schema.racks)
      .values({ tenantId: tenant.id, storeId: storeA.id, code: "R-A1", name: "Front Shelf A1" })
      .returning();

    const [rackB] = await t.db
      .insert(schema.racks)
      .values({ tenantId: tenant.id, storeId: storeB.id, code: "R-B1", name: "Branch B Rack 1" })
      .returning();

    // Medicines
    const med1 = await makeMedicine(t.db, tenant.id, { name: "Dolo 650", rackId: null });
    const med2 = await makeMedicine(t.db, tenant.id, { name: "Cetirizine 10", rackId: null });

    // Store Settings: In Store A, med1 is on Rack A1, med2 is unassigned
    await t.db.insert(schema.storeMedicineSettings).values({
      tenantId: tenant.id,
      storeId: storeA.id,
      medicineId: med1.id,
      rackId: rackA.id,
    });

    // In Store B, both med1 and med2 are on Rack B1
    await t.db.insert(schema.storeMedicineSettings).values([
      { tenantId: tenant.id, storeId: storeB.id, medicineId: med1.id, rackId: rackB.id },
      { tenantId: tenant.id, storeId: storeB.id, medicineId: med2.id, rackId: rackB.id },
    ]);

    // Batches in Store A
    await makeBatch(t.db, { tenantId: tenant.id, storeId: storeA.id, medicineId: med1.id, batchNo: "B-A1", qtyOnHand: 50, purchaseRate: 1500 });
    await makeBatch(t.db, { tenantId: tenant.id, storeId: storeA.id, medicineId: med2.id, batchNo: "B-A2", qtyOnHand: 30, purchaseRate: 800 });

    // Full store audit in Store A: med1 gets rackA, med2 gets null
    const resA = await t.db.transaction(async (tx) => {
      return createStockAuditSession(tx, {
        tenantId: tenant.id,
        storeId: storeA.id,
        scope: "full_store",
        userId: user.id,
      });
    });

    const detailsA = await getStockAuditSessionDetails(t.db, { tenantId: tenant.id, sessionId: resA.sessionId });
    expect(detailsA).not.toBeNull();
    const item1 = detailsA!.items.find((i) => i.medicineId === med1.id);
    const item2 = detailsA!.items.find((i) => i.medicineId === med2.id);

    expect(item1?.rackCode).toBe("R-A1");
    expect(item2?.rackCode).toBe("Unassigned");

    // Rack audit in Store A for rackA: only med1 should be snapshotted
    const resRackA = await t.db.transaction(async (tx) => {
      return createStockAuditSession(tx, {
        tenantId: tenant.id,
        storeId: storeA.id,
        scope: "racks",
        rackIds: [rackA.id],
        userId: user.id,
      });
    });

    const detailsRackA = await getStockAuditSessionDetails(t.db, { tenantId: tenant.id, sessionId: resRackA.sessionId });
    expect(detailsRackA!.items.length).toBe(1);
    expect(detailsRackA!.items[0].medicineId).toBe(med1.id);
  });

  it("performs movement-aware reconciliation without double-deducting subsequent sales", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id, { name: "Retail Counter", code: "RET-1" });
    const user = await makeUser(t.db);

    const med = await makeMedicine(t.db, tenant.id, { name: "Azithromycin 500", rackId: null });
    const batch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      medicineId: med.id,
      batchNo: "AZ-101",
      qtyOnHand: 100,
      purchaseRate: 5000, // ₹50.00
    });

    // 1. Create audit session
    const sessionRes = await t.db.transaction(async (tx) => {
      return createStockAuditSession(tx, {
        tenantId: tenant.id,
        storeId: store.id,
        scope: "full_store",
        userId: user.id,
      });
    });

    // 2. Staff counts 90 units physically at shelf (shortage of 10 units)
    const countTime = new Date();
    await t.db.transaction(async (tx) => {
      const details = await getStockAuditSessionDetails(tx, { tenantId: tenant.id, sessionId: sessionRes.sessionId });
      const auditItem = details!.items[0];
      await recordStockAuditCounts(tx, {
        tenantId: tenant.id,
        sessionId: sessionRes.sessionId,
        counts: [{ itemId: auditItem.id, countedQty: 90, observedAt: countTime }],
        userId: user.id,
      });
    });

    // 3. Simulate subsequent POS sale occurring after physical count
    const saleTime = new Date(countTime.getTime() + 1000); // 1 sec later
    await t.db.transaction(async (tx) => {
      // Live balance is reduced by 2
      await tx.update(schema.batches).set({ qtyOnHand: 98 }).where(eq(schema.batches.id, batch.id));
      await tx.insert(schema.stockMovements).values({
        tenantId: tenant.id,
        storeId: store.id,
        batchId: batch.id,
        medicineId: med.id,
        type: "sale",
        qtyChange: -2,
        balanceAfter: 98,
        createdAt: saleTime,
      });
    });

    // 4. Manager approves audit session
    const approvalRes = await t.db.transaction(async (tx) => {
      return approveStockAuditSession(tx, {
        tenantId: tenant.id,
        storeId: store.id,
        sessionId: sessionRes.sessionId,
        userId: user.id,
      });
    });

    // Assertions:
    // Final balance F = C + M_after = 90 + (-2) = 88.
    // Live was 98, so adjustment delta is 88 - 98 = -10.
    expect(approvalRes.status).toBe("approved");
    expect(approvalRes.reconciledAdjustmentsCount).toBe(1);
    expect(approvalRes.totalShortagePaise).toBe(50000); // 10 units * 5000 paise = ₹500.00
    expect(approvalRes.netFinancialImpactPaise).toBe(-50000);

    const [updatedBatch] = await t.db.select().from(schema.batches).where(eq(schema.batches.id, batch.id));
    expect(updatedBatch.qtyOnHand).toBe(88); // Not 78! Double deduction avoided!

    // Verify stock adjustment movement recorded
    const [adjustmentMovement] = await t.db
      .select()
      .from(schema.stockMovements)
      .where(and(eq(schema.stockMovements.batchId, batch.id), eq(schema.stockMovements.type, "adjustment")));

    expect(adjustmentMovement).toBeDefined();
    expect(adjustmentMovement.qtyChange).toBe(-10);
    expect(adjustmentMovement.balanceAfter).toBe(88);

    // Verify audit log row inserted
    const [auditLog] = await t.db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityId, sessionRes.sessionId),
          eq(schema.auditLogs.action, "stock_adjust")
        )
      );

    expect(auditLog).toBeDefined();
  });
});
