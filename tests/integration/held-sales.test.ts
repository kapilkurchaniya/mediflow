import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { createTestDb } from "../setup/db";
import { makeBatch, makeCustomer, makeMedicine, makeStore, makeTenant, makeUser, makeWorld } from "../setup/factories";

vi.mock("@/server/auth", () => ({
  requireAuth: async () => {
    throw new Error("not used");
  },
  getCurrentSession: async () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { holdSale, listHeldSales, resumeHeldSale, discardHeldSale } from "@/server/domain/sales/held";
import { createSale } from "@/server/domain/sales/create-sale";
import { SaleInput } from "@/server/domain/sales/types";
import type { AuthCtx } from "@/server/rbac";
import { format, subDays, addDays } from "date-fns";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

type World = Awaited<ReturnType<typeof makeWorld>>;

function ctxFor(w: Pick<World, "tenant" | "store" | "user">, permissions: readonly string[] = ALL_PERMISSIONS): AuthCtx {
  return {
    tenantId: w.tenant.id,
    storeId: w.store.id,
    userId: w.user.id,
    user: { id: w.user.id, name: w.user.name, email: w.user.email, pharmacistRegNo: "PH-123" },
    permissions: new Set(permissions) as AuthCtx["permissions"],
    allowedStoreIds: "all",
  };
}

async function setupHeldScene(opts: { schedule?: string } = {}) {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id, { stateCode: "27" });
  const user = await makeUser(t.db);
  const maker = (await t.db.insert(schema.manufacturers).values({ tenantId: tenant.id, name: "Cipla" }).returning())[0];
  const medicine = await makeMedicine(t.db, tenant.id, { schedule: opts.schedule ?? "none", manufacturerId: maker.id, unitsPerPack: 10 });
  const futureExpiry = format(addDays(new Date(), 180), "yyyy-MM-dd");
  const batch = await makeBatch(t.db, {
    tenantId: tenant.id,
    storeId: store.id,
    medicineId: medicine.id,
    qtyOnHand: 50,
    expiryDate: futureExpiry,
    mrp: 10000,
    saleRate: 10000,
  });

  const w = { tenant, store, user, medicine };
  const ctx = ctxFor(w);

  return { w, ctx, batch, medicine };
}

describe("Held / Parked Bills (Integration - Task A2.3)", () => {
  it("holds a sale without allocating invoice number, stock deduction, or journal posting", async () => {
    const s = await setupHeldScene();
    const customer = await makeCustomer(t.db, s.w.tenant.id, { name: "Vikram Malhotra", phone: "9876543210" });

    const holdResult = await t.db.transaction((tx) =>
      holdSale(tx, s.ctx, {
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        doctorName: "Dr. K. S. Sethi",
        notes: "Stepped away to get cash",
        items: [
          {
            medicineId: s.medicine.id,
            medicineName: s.medicine.name,
            batchId: s.batch.id,
            batchNo: s.batch.batchNo,
            expiryDate: s.batch.expiryDate,
            packQty: 2,
            looseQty: 5,
            unitsPerPack: 10,
            packUnit: "strip",
            looseUnit: "tablet",
            rate: 10000,
            mrp: 10000,
            discountBp: 0,
            gstRateBp: 500,
            isAutoFefo: true,
          },
        ],
      })
    );

    expect(holdResult.heldSaleId).toBeDefined();
    expect(holdResult.itemCount).toBe(1);

    // Verify database row
    const [heldRow] = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, holdResult.heldSaleId));

    expect(heldRow).toBeDefined();
    expect(heldRow.status).toBe("held");
    expect(heldRow.invoiceNo).toBeNull();
    expect(heldRow.customerName).toBe("Vikram Malhotra");
    expect(heldRow.notes).toBe("Stepped away to get cash");

    // Verify stock is untouched
    const [batchCheck] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, s.batch.id));
    expect(batchCheck.qtyOnHand).toBe(50);

    // Verify no stock movements
    const movements = await t.db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.refId, holdResult.heldSaleId));
    expect(movements).toHaveLength(0);

    // Verify no journal entries
    const journals = await t.db
      .select()
      .from(schema.journalEntries)
      .where(eq(schema.journalEntries.refId, holdResult.heldSaleId));
    expect(journals).toHaveLength(0);

    // Verify audit log
    const auditLogs = await t.db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityType, "held_sale"),
          eq(schema.auditLogs.entityId, holdResult.heldSaleId)
        )
      );
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0].action).toBe("create");
  });

  it("lists active held sales and calculates aged (> 24h) status", async () => {
    const s = await setupHeldScene();

    // 1. Fresh parked bill
    const fresh = await t.db.transaction((tx) =>
      holdSale(tx, s.ctx, {
        customerName: "Recent Customer",
        items: [
          {
            medicineId: s.medicine.id,
            medicineName: s.medicine.name,
            batchId: s.batch.id,
            batchNo: s.batch.batchNo,
            expiryDate: s.batch.expiryDate,
            packQty: 1,
            looseQty: 0,
            unitsPerPack: 10,
            rate: 10000,
            mrp: 10000,
            gstRateBp: 500,
          },
        ],
      })
    );

    // 2. Old parked bill (> 24h ago)
    const old = await t.db.transaction((tx) =>
      holdSale(tx, s.ctx, {
        customerName: "Aged Customer",
        items: [
          {
            medicineId: s.medicine.id,
            medicineName: s.medicine.name,
            batchId: s.batch.id,
            batchNo: s.batch.batchNo,
            expiryDate: s.batch.expiryDate,
            packQty: 1,
            looseQty: 0,
            unitsPerPack: 10,
            rate: 10000,
            mrp: 10000,
            gstRateBp: 500,
          },
        ],
      })
    );

    // Backdate the aged bill to 30 hours ago
    await t.db
      .update(schema.sales)
      .set({ createdAt: subDays(new Date(), 2) })
      .where(eq(schema.sales.id, old.heldSaleId));

    const list = await t.db.transaction((tx) => listHeldSales(tx, s.ctx));
    expect(list.length).toBeGreaterThanOrEqual(2);

    const freshEntry = list.find((h) => h.id === fresh.heldSaleId);
    const oldEntry = list.find((h) => h.id === old.heldSaleId);

    expect(freshEntry?.isOlderThan24h).toBe(false);
    expect(oldEntry?.isOlderThan24h).toBe(true);
  });

  it("resumes held bill with revalidation detecting live stock shortage", async () => {
    const s = await setupHeldScene();

    // Park bill needing 2 packs (20 units)
    const holdRes = await t.db.transaction((tx) =>
      holdSale(tx, s.ctx, {
        customerName: "Queue Customer",
        items: [
          {
            medicineId: s.medicine.id,
            medicineName: s.medicine.name,
            batchId: s.batch.id,
            batchNo: s.batch.batchNo,
            expiryDate: s.batch.expiryDate,
            packQty: 2,
            looseQty: 0,
            unitsPerPack: 10,
            rate: 10000,
            mrp: 10000,
            gstRateBp: 500,
          },
        ],
      })
    );

    // Initial resume: full stock available (50 on hand)
    const resumeInitial = await t.db.transaction((tx) =>
      resumeHeldSale(tx, s.ctx, holdRes.heldSaleId)
    );
    expect(resumeInitial.revalidation.hasIssues).toBe(false);
    expect(resumeInitial.revalidation.hasStockShortage).toBe(false);

    // Simulate another counter selling 40 units, leaving only 10 on hand
    await t.db
      .update(schema.batches)
      .set({ qtyOnHand: 10 })
      .where(eq(schema.batches.id, s.batch.id));

    // Second resume: shortage detected (needs 20, only 10 left)
    const resumeShortage = await t.db.transaction((tx) =>
      resumeHeldSale(tx, s.ctx, holdRes.heldSaleId)
    );
    expect(resumeShortage.revalidation.hasIssues).toBe(true);
    expect(resumeShortage.revalidation.hasStockShortage).toBe(true);
    expect(resumeShortage.revalidation.items[0].isStockShortage).toBe(true);
    expect(resumeShortage.revalidation.items[0].availableQtyOnHand).toBe(10);
  });

  it("resumes held bill with revalidation detecting expired batch", async () => {
    const s = await setupHeldScene();

    const holdRes = await t.db.transaction((tx) =>
      holdSale(tx, s.ctx, {
        customerName: "Late Customer",
        items: [
          {
            medicineId: s.medicine.id,
            medicineName: s.medicine.name,
            batchId: s.batch.id,
            batchNo: s.batch.batchNo,
            expiryDate: s.batch.expiryDate,
            packQty: 1,
            looseQty: 0,
            unitsPerPack: 10,
            rate: 10000,
            mrp: 10000,
            gstRateBp: 500,
          },
        ],
      })
    );

    // Expire the batch
    await t.db
      .update(schema.batches)
      .set({ expiryDate: "2020-01-01" })
      .where(eq(schema.batches.id, s.batch.id));

    const resumeExpired = await t.db.transaction((tx) =>
      resumeHeldSale(tx, s.ctx, holdRes.heldSaleId)
    );
    expect(resumeExpired.revalidation.hasIssues).toBe(true);
    expect(resumeExpired.revalidation.hasExpiredBatches).toBe(true);
    expect(resumeExpired.revalidation.items[0].isExpired).toBe(true);
  });

  it("discards a held sale and writes an audit entry", async () => {
    const s = await setupHeldScene();

    const holdRes = await t.db.transaction((tx) =>
      holdSale(tx, s.ctx, {
        customerName: "Cancelling Customer",
        items: [
          {
            medicineId: s.medicine.id,
            medicineName: s.medicine.name,
            batchId: s.batch.id,
            batchNo: s.batch.batchNo,
            expiryDate: s.batch.expiryDate,
            packQty: 1,
            looseQty: 0,
            unitsPerPack: 10,
            rate: 10000,
            mrp: 10000,
            gstRateBp: 500,
          },
        ],
      })
    );

    await t.db.transaction((tx) =>
      discardHeldSale(tx, s.ctx, holdRes.heldSaleId, "Customer decided not to purchase")
    );

    const [discarded] = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, holdRes.heldSaleId));

    expect(discarded.status).toBe("cancelled");
    expect(discarded.cancelReason).toBe("Customer decided not to purchase");

    const audit = await t.db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityType, "held_sale"),
          eq(schema.auditLogs.entityId, holdRes.heldSaleId),
          eq(schema.auditLogs.action, "delete")
        )
      );
    expect(audit).toHaveLength(1);
  });

  it("atomically cleans up held bill when completing sale checkout", async () => {
    const s = await setupHeldScene();
    const customer = await makeCustomer(t.db, s.w.tenant.id, { phone: "9876543210" });

    // 1. Park bill
    const holdRes = await t.db.transaction((tx) =>
      holdSale(tx, s.ctx, {
        customerId: customer.id,
        items: [
          {
            medicineId: s.medicine.id,
            medicineName: s.medicine.name,
            batchId: s.batch.id,
            batchNo: s.batch.batchNo,
            expiryDate: s.batch.expiryDate,
            packQty: 1,
            looseQty: 0,
            unitsPerPack: 10,
            rate: 10000,
            mrp: 10000,
            gstRateBp: 500,
          },
        ],
      })
    );

    // Verify held row exists
    const [heldBefore] = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, holdRes.heldSaleId));
    expect(heldBefore).toBeDefined();

    // 2. Complete sale passing heldSaleId
    const finalSale = await t.db.transaction((tx) =>
      createSale(
        tx,
        s.ctx,
        SaleInput.parse({
          customerId: customer.id,
          heldSaleId: holdRes.heldSaleId,
          lines: [
            {
              batchId: s.batch.id,
              packQty: 1,
              looseQty: 0,
              discountBp: 0,
            },
          ],
          payments: [{ method: "cash", amount: 10000 }],
        }),
        { source: "pos" }
      )
    );

    expect(finalSale.invoiceNo).toMatch(/^INV\/\d{2}-\d{2}\/000001$/);

    // Verify held bill row is removed from sales
    const heldAfter = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, holdRes.heldSaleId));
    expect(heldAfter).toHaveLength(0);

    // Verify completed sale exists
    const [completedSale] = await t.db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.id, finalSale.saleId));
    expect(completedSale.status).toBe("completed");
    expect(completedSale.invoiceNo).toBe(finalSale.invoiceNo);
  });
});
