import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb, type TestDb } from "../setup/db";
import { makeBatch, makeCustomer, makeMedicine, makeStore, makeTenant, makeUser } from "../setup/factories";
import {
  createStore,
  deactivateStore,
  getStore,
  listStores,
  reactivateStore,
  updateStore,
} from "@/server/domain/stores";
import { createSale } from "@/server/domain/sales/create-sale";
import type { AuthCtx } from "@/server/rbac";
import { ALL_PERMISSIONS } from "@/lib/permissions";

describe("Store Management & Warehouse Configuration (Integration - Task A3.1)", () => {
  let testDb: { db: TestDb; cleanup: () => Promise<void> };
  let db: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb?.cleanup();
  });

  it("creates retail and warehouse stores with valid settings and audit logging", async () => {
    const tenant = await makeTenant(db);
    const user = await makeUser(db);
    const ctx: AuthCtx = {
      tenantId: tenant.id,
      storeId: "",
      userId: user.id,
      user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: null },
      permissions: new Set(ALL_PERMISSIONS),
      allowedStoreIds: "all",
    };

    // 1. Create Retail Store
    const retail = await createStore(db, ctx, {
      name: "Downtown Branch",
      code: "DT01",
      kind: "retail",
      stateCode: "27",
      invoicePrefix: "DT",
      gstin: "27GSPTE0985F1Z5",
      settings: {
        requireShift: true,
        maxDiscountBp: 1500,
      },
    });

    expect(retail.id).toBeDefined();
    expect(retail.kind).toBe("retail");
    expect(retail.code).toBe("DT01");
    expect(retail.settings.requireShift).toBe(true);
    expect(retail.settings.maxDiscountBp).toBe(1500);
    expect(retail.settings.printFormat).toBe("thermal_80mm"); // defaulted
    expect(retail.settings.defaultPaymentMethod).toBe("cash"); // defaulted

    // 2. Create Warehouse Store
    const warehouse = await createStore(db, ctx, {
      name: "Central Godown",
      code: "WH01",
      kind: "warehouse",
      stateCode: "27",
      invoicePrefix: "WH",
      gstin: "27GSPTE0985F1Z5", // Same state shared GSTIN
    });

    expect(warehouse.id).toBeDefined();
    expect(warehouse.kind).toBe("warehouse");
    expect(warehouse.code).toBe("WH01");
    expect(warehouse.settings.requireShift).toBe(false); // default

    // Verify audit logs were written
    const audits = await db
      .select()
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.tenantId, tenant.id), eq(schema.auditLogs.entityType, "store")));
    expect(audits.length).toBe(2);
    expect(audits[0].action).toBe("create");
  });

  it("rejects duplicate store code within the same tenant (case-insensitive)", async () => {
    const tenant = await makeTenant(db);
    const user = await makeUser(db);
    const ctx = { tenantId: tenant.id, userId: user.id };

    await createStore(db, ctx, {
      name: "Store One",
      code: "MUM1",
      stateCode: "27",
      invoicePrefix: "MUM",
    });

    // Try to create with same code lowercase
    await expect(
      createStore(db, ctx, {
        name: "Store Two",
        code: "mum1",
        stateCode: "27",
        invoicePrefix: "MUM",
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it("allows same store code across different tenants", async () => {
    const tenantA = await makeTenant(db);
    const tenantB = await makeTenant(db);
    const user = await makeUser(db);

    const storeA = await createStore(db, { tenantId: tenantA.id, userId: user.id }, {
      name: "Branch A",
      code: "BR01",
      stateCode: "27",
      invoicePrefix: "BR",
    });

    const storeB = await createStore(db, { tenantId: tenantB.id, userId: user.id }, {
      name: "Branch B",
      code: "BR01",
      stateCode: "27",
      invoicePrefix: "BR",
    });

    expect(storeA.code).toBe("BR01");
    expect(storeB.code).toBe("BR01");
    expect(storeA.id).not.toBe(storeB.id);
  });

  it("rejects GSTIN if state code does not match store state code", async () => {
    const tenant = await makeTenant(db);
    const user = await makeUser(db);

    // GSTIN is Maharashtra (27), but store stateCode is Karnataka (29)
    await expect(
      createStore(db, { tenantId: tenant.id, userId: user.id }, {
        name: "Bangalore Store",
        code: "BLR1",
        stateCode: "29",
        invoicePrefix: "BLR",
        gstin: "27GSPTE0985F1Z5",
      }),
    ).rejects.toThrow(/does not match/i);
  });

  it("rejects invoice prefix exceeding statutory 16-character rendered length", async () => {
    const tenant = await makeTenant(db);
    const user = await makeUser(db);

    // Prefix "TOOLONG" -> TOOLONG/26-27/999999 = 20 chars
    await expect(
      createStore(db, { tenantId: tenant.id, userId: user.id }, {
        name: "Store",
        code: "ST01",
        stateCode: "27",
        invoicePrefix: "TOOLONG",
      }),
    ).rejects.toThrow(/exceeds the 16-character/i);
  });

  it("partially updates store settings without resetting unrelated fields", async () => {
    const tenant = await makeTenant(db);
    const user = await makeUser(db);
    const ctx = { tenantId: tenant.id, userId: user.id };

    const store = await createStore(db, ctx, {
      name: "Original Store",
      code: "OG01",
      stateCode: "27",
      invoicePrefix: "OG",
      settings: {
        requireShift: true,
        maxDiscountBp: 2000,
        printFormat: "a4",
      },
    });

    // Partial update: change only printFormat
    const updated = await updateStore(db, ctx, store.id, {
      settings: {
        printFormat: "thermal_58mm",
      },
    });

    expect(updated.settings.printFormat).toBe("thermal_58mm");
    expect(updated.settings.requireShift).toBe(true); // preserved
    expect(updated.settings.maxDiscountBp).toBe(2000); // preserved
  });

  it("enforces immutability: rejects store code and kind modification once transactions exist", async () => {
    const tenant = await makeTenant(db);
    const store = await makeStore(db, tenant.id, { kind: "retail", code: "RET1" });
    const user = await makeUser(db);
    const customer = await makeCustomer(db, tenant.id);
    const med = await makeMedicine(db, tenant.id);
    const batch = await makeBatch(db, { tenantId: tenant.id, storeId: store.id, medicineId: med.id, qtyOnHand: 50 });

    const ctx: AuthCtx = {
      tenantId: tenant.id,
      storeId: store.id,
      userId: user.id,
      user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: null },
      permissions: new Set(ALL_PERMISSIONS),
      allowedStoreIds: "all",
    };

    // Perform a sale
    await db.transaction((tx) =>
      createSale(tx, ctx, {
        lines: [{ batchId: batch.id, medicineId: med.id, qty: 1, discountBp: 0 }],
        payments: [{ method: "cash", amount: 10000 }],
        billDiscountPaise: 0,
        customerId: customer.id,
        redeemPoints: 0,
      }),
    );

    // Try to update code
    await expect(
      updateStore(db, ctx, store.id, {
        code: "NEW1",
      }),
    ).rejects.toThrow(/code cannot be changed after transactions/i);

    // Try to update kind from retail to warehouse
    await expect(
      updateStore(db, ctx, store.id, {
        kind: "warehouse",
      }),
    ).rejects.toThrow(/kind cannot be changed after transactions/i);
  });

  it("deactivation safeguards: rejects deactivation when open shift, held bill, or in-transit transfer exist", async () => {
    const tenant = await makeTenant(db);
    const user = await makeUser(db);
    const ctx = { tenantId: tenant.id, userId: user.id };

    // Create 2 stores so it's not the only active store
    const store1 = await createStore(db, ctx, { name: "Store 1", code: "S1", stateCode: "27", invoicePrefix: "S1" });
    const store2 = await createStore(db, ctx, { name: "Store 2", code: "S2", stateCode: "27", invoicePrefix: "S2" });

    // 1. With open cash session
    await db.insert(schema.cashSessions).values({
      tenantId: tenant.id,
      storeId: store1.id,
      openedBy: user.id,
      openingCash: 1000,
      status: "open",
    });

    await expect(deactivateStore(db, ctx, store1.id)).rejects.toThrow(/open cash register shift exists/i);

    // Close the cash session
    await db
      .update(schema.cashSessions)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(schema.cashSessions.storeId, store1.id));

    // 2. With held bill
    await db.insert(schema.sales).values({
      tenantId: tenant.id,
      storeId: store1.id,
      createdBy: user.id,
      invoiceNo: "HELD-01",
      status: "held",
    });

    await expect(deactivateStore(db, ctx, store1.id)).rejects.toThrow(/active held bills/i);

    // Remove the held bill
    await db.delete(schema.sales).where(eq(schema.sales.storeId, store1.id));

    // 3. With in-transit transfer
    await db.insert(schema.stockTransfers).values({
      tenantId: tenant.id,
      transferNo: "TR-001",
      fromStoreId: store1.id,
      toStoreId: store2.id,
      createdBy: user.id,
      status: "dispatched",
    });

    await expect(deactivateStore(db, ctx, store1.id)).rejects.toThrow(/in-transit stock transfers/i);

    // Clear transfer
    await db.delete(schema.stockTransfers).where(eq(schema.stockTransfers.fromStoreId, store1.id));

    // 4. Now clean deactivation succeeds
    const deactivated = await deactivateStore(db, ctx, store1.id);
    expect(deactivated.isActive).toBe(false);

    // 5. Try deactivating store2 (which is now the last active store)
    await expect(deactivateStore(db, ctx, store2.id)).rejects.toThrow(/only active store/i);

    // 6. Reactivate store1
    const reactivated = await reactivateStore(db, ctx, store1.id);
    expect(reactivated.isActive).toBe(true);
  });

  it("blocks POS sales from a warehouse store with WAREHOUSE_POS_NOT_ALLOWED", async () => {
    const tenant = await makeTenant(db);
    const user = await makeUser(db);
    const customer = await makeCustomer(db, tenant.id);
    const med = await makeMedicine(db, tenant.id);

    // Warehouse store
    const whStore = await createStore(db, { tenantId: tenant.id, userId: user.id }, {
      name: "Depot",
      code: "D01",
      kind: "warehouse",
      stateCode: "27",
      invoicePrefix: "DPT",
    });

    const batch = await makeBatch(db, { tenantId: tenant.id, storeId: whStore.id, medicineId: med.id, qtyOnHand: 50 });

    const ctx: AuthCtx = {
      tenantId: tenant.id,
      storeId: whStore.id,
      userId: user.id,
      user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: null },
      permissions: new Set(ALL_PERMISSIONS),
      allowedStoreIds: "all",
    };

    await expect(
      db.transaction((tx) =>
        createSale(tx, ctx, {
          lines: [{ batchId: batch.id, medicineId: med.id, qty: 1, discountBp: 0 }],
          payments: [{ method: "cash", amount: 10000 }],
          billDiscountPaise: 0,
          customerId: customer.id,
          redeemPoints: 0,
        }),
      ),
    ).rejects.toThrow(/Retail sales cannot be processed from a warehouse location/i);
  });
});
