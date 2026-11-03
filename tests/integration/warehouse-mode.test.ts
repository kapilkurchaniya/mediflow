import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { createTestDb } from "../setup/db";
import { makeBatch, makeMedicine, makeStore, makeTenant, makeUser } from "../setup/factories";
import { createSale } from "@/server/domain/sales/create-sale";
import { holdSale } from "@/server/domain/sales/held";
import { openShift } from "@/server/domain/cash-sessions";
import {
  createDraftTransfer,
  dispatchTransfer,
  receiveTransfer,
  getTransferById,
} from "@/server/domain/inventory/transfers";
import type { AuthCtx } from "@/server/rbac";

vi.mock("@/server/auth", () => ({
  requireAuth: async () => {
    throw new Error("not used");
  },
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

function createMockCtx(tenantId: string, storeId: string, userId: string): AuthCtx {
  return {
    tenantId,
    storeId,
    userId,
    user: { id: userId, name: "Warehouse Manager", email: "wh@mediflow.test", pharmacistRegNo: null },
    permissions: new Set(ALL_PERMISSIONS) as AuthCtx["permissions"],
    allowedStoreIds: "all",
  };
}

describe("Task A3.5: Warehouse Mode Integration", () => {
  it("rejects createSale, holdSale, and openShift in a warehouse store (zero-bypass)", async () => {
    const tenant = await makeTenant(t.db);
    const warehouse = await makeStore(t.db, tenant.id, {
      name: "Central Warehouse",
      code: "WH01",
      kind: "warehouse",
      stateCode: "27",
    });
    const user = await makeUser(t.db);
    const ctx = createMockCtx(tenant.id, warehouse.id, user.id);

    const med = await makeMedicine(t.db, tenant.id, { name: "Amoxicillin 500mg" });
    const batch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: warehouse.id,
      medicineId: med.id,
      batchNo: "AMX-001",
      qtyOnHand: 50,
      mrp: 10000,
      purchaseRate: 6000,
    });

    // 1. Attempt createSale from warehouse -> Expect WAREHOUSE_POS_NOT_ALLOWED
    await expect(
      t.db.transaction(async (tx) => {
        return createSale(tx, ctx, {
          lines: [{ batchId: batch.id, qty: 5, discountBp: 0 }],
          billDiscountPaise: 0,
          redeemPoints: 0,
          payments: [{ method: "cash", amount: 50000 }],
        });
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "WAREHOUSE_POS_NOT_ALLOWED",
      }),
    );

    // 2. Attempt holdSale from warehouse -> Expect WAREHOUSE_POS_NOT_ALLOWED
    await expect(
      t.db.transaction(async (tx) => {
        return holdSale(tx, ctx, {
          items: [{
            medicineId: med.id,
            medicineName: med.name,
            batchId: batch.id,
            batchNo: batch.batchNo,
            expiryDate: batch.expiryDate,
            packQty: 5,
            looseQty: 0,
            unitsPerPack: 10,
            packUnit: "strip",
            looseUnit: "tablet",
            rate: 10000,
            mrp: 10000,
            discountBp: 0,
            gstRateBp: 500,
          }],
        });
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "WAREHOUSE_POS_NOT_ALLOWED",
      }),
    );

    // 3. Attempt openShift from warehouse -> Expect WAREHOUSE_SHIFT_NOT_ALLOWED
    await expect(
      t.db.transaction(async (tx) => {
        return openShift(tx, ctx, {
          openingCash: 100000, // ₹1,000
          notes: "Morning shift attempt",
        });
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "WAREHOUSE_SHIFT_NOT_ALLOWED",
      }),
    );
  });

  it("permits warehouse purchasing, stock holding, and dispatching transfers to retail store", async () => {
    const tenant = await makeTenant(t.db);
    const warehouse = await makeStore(t.db, tenant.id, {
      name: "Central Distribution Depot",
      code: "DEP1",
      kind: "warehouse",
      stateCode: "27",
      gstin: "27AAAAA0000A1Z5",
    });
    const retailStore = await makeStore(t.db, tenant.id, {
      name: "Downtown Pharmacy",
      code: "RET1",
      kind: "retail",
      stateCode: "27",
      gstin: "27AAAAA0000A1Z5",
    });
    const user = await makeUser(t.db);

    const whCtx = { tenantId: tenant.id, storeId: warehouse.id, userId: user.id };
    const retCtx = { tenantId: tenant.id, storeId: retailStore.id, userId: user.id };

    const med = await makeMedicine(t.db, tenant.id, { name: "Ciprofloxacin 500mg" });

    // 1. Inward Goods / Batch creation into warehouse
    const whBatch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: warehouse.id,
      medicineId: med.id,
      batchNo: "CIPRO-WH-01",
      qtyOnHand: 200,
      purchaseRate: 4000,
      mrp: 7500,
    });

    expect(whBatch.qtyOnHand).toBe(200);

    // 2. Draft transfer from warehouse to retail branch
    const draft = await createDraftTransfer(whCtx, {
      fromStoreId: warehouse.id,
      toStoreId: retailStore.id,
      notes: "Replenishing retail counter from central warehouse",
      items: [{ medicineId: med.id, fromBatchId: whBatch.id, qty: 80 }],
    }, t.db);

    expect(draft.transferId).toBeDefined();

    // 3. Dispatch transfer from warehouse
    const dispatchRes = await dispatchTransfer(whCtx, {
      transferId: draft.transferId,
      idempotencyKey: "wh-dispatch-1",
    }, t.db);

    expect(dispatchRes.status).toBe("dispatched");
    expect(dispatchRes.docKind).toBe("delivery_challan");

    // Check warehouse stock deducted
    const [updatedWhBatch] = await t.db
      .select({ qtyOnHand: schema.batches.qtyOnHand })
      .from(schema.batches)
      .where(eq(schema.batches.id, whBatch.id));

    expect(updatedWhBatch!.qtyOnHand).toBe(120);

    // 4. Retail branch receives transfer
    const transferDetails = await getTransferById(tenant.id, draft.transferId, t.db);
    const lineItem = transferDetails.items[0]!;

    const receiveRes = await receiveTransfer(retCtx, {
      transferId: draft.transferId,
      idempotencyKey: "ret-receive-1",
      items: [{
        itemId: lineItem.id,
        qtyReceived: 80,
        qtyDamaged: 0,
        qtyShortage: 0,
      }],
    }, t.db);

    expect(receiveRes.status).toBe("received");

    // 5. Verify batch created at retail store with identical provenance and quantity
    const [retBatch] = await t.db
      .select()
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.tenantId, tenant.id),
          eq(schema.batches.storeId, retailStore.id),
          eq(schema.batches.medicineId, med.id),
          eq(schema.batches.batchNo, "CIPRO-WH-01"),
        ),
      );

    expect(retBatch).toBeDefined();
    expect(retBatch!.qtyOnHand).toBe(80);
    expect(retBatch!.mrp).toBe(7500);
    expect(retBatch!.purchaseRate).toBe(4000);

    // 6. Verify warehouse stock query only reports remaining warehouse inventory
    const whStock = await t.db
      .select({ sum: schema.batches.qtyOnHand })
      .from(schema.batches)
      .where(and(eq(schema.batches.tenantId, tenant.id), eq(schema.batches.storeId, warehouse.id)));

    expect(whStock[0]!.sum).toBe(120);
  });
});
