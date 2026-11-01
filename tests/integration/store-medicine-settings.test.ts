import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb, type TestDb } from "../setup/db";
import { makeMedicine, makeStore, makeTenant, makeUser } from "../setup/factories";
import { seedSystemRoles } from "@/server/roles";
import {
  getStoreMedicineSettings,
  updateStoreMedicineSettings,
} from "@/server/domain/catalog/store-settings";
import { assignMedicineToRack, deleteRack, getRacks } from "@/app/actions/racks";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import type { AuthCtx } from "@/server/rbac";

describe("Per-Store Medicine Settings (Integration - Task A3.3)", () => {
  let testDb: { db: TestDb; cleanup: () => Promise<void> };
  let db: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb?.cleanup();
  });

  function createAuthCtx(tenantId: string, storeId: string, userId: string): AuthCtx {
    return {
      userId,
      tenantId,
      storeId,
      user: { id: userId, name: "Test User", email: "test@example.com", pharmacistRegNo: null },
      permissions: new Set(ALL_PERMISSIONS),
      allowedStoreIds: "all",
    };
  }

  it("resolves catalog defaults when no branch override exists", async () => {
    const tenant = await makeTenant(db);
    const store1 = await makeStore(db, tenant.id, { name: "Branch 1", code: "B01" });
    const user = await makeUser(db);
    const ctx = createAuthCtx(tenant.id, store1.id, user.id);

    const med = await makeMedicine(db, tenant.id, {
      name: "Paracetamol 500mg",
      reorderLevel: 15,
      maxStock: 150,
      salePrice: 2500, // ₹25.00
    });

    const settingsMap = await getStoreMedicineSettings(db, ctx, store1.id, [med.id]);
    const setting = settingsMap.get(med.id);

    expect(setting).toBeDefined();
    expect(setting?.reorderLevel).toBe(15);
    expect(setting?.maxStock).toBe(150);
    expect(setting?.salePrice).toBe(2500);
    expect(setting?.salePriceSource).toBe("catalog_default");
    expect(setting?.rackId).toBeNull();
    expect(setting?.hasStoreOverrides).toBe(false);
  });

  it("allows branch-specific thresholds and price overrides without mutating catalog master or other branches", async () => {
    const tenant = await makeTenant(db);
    const store1 = await makeStore(db, tenant.id, { name: "High Footfall Branch", code: "B01" });
    const store2 = await makeStore(db, tenant.id, { name: "Quiet Branch", code: "B02" });
    const user = await makeUser(db);
    const ctx1 = createAuthCtx(tenant.id, store1.id, user.id);
    const ctx2 = createAuthCtx(tenant.id, store2.id, user.id);

    const med = await makeMedicine(db, tenant.id, {
      name: "Amoxicillin 500mg",
      reorderLevel: 10,
      maxStock: 100,
      salePrice: 8000, // ₹80.00 catalog default
    });

    // Store 1 sets custom reorder level and price override
    await updateStoreMedicineSettings(db, ctx1, store1.id, med.id, {
      reorderLevel: 40,
      maxStock: 400,
      salePriceOverride: 9500, // ₹95.00 in Store 1
    });

    // Query Store 1
    const res1 = await getStoreMedicineSettings(db, ctx1, store1.id, [med.id]);
    const setting1 = res1.get(med.id);
    expect(setting1?.reorderLevel).toBe(40);
    expect(setting1?.maxStock).toBe(400);
    expect(setting1?.salePrice).toBe(9500);
    expect(setting1?.salePriceSource).toBe("store_override");
    expect(setting1?.hasStoreOverrides).toBe(true);

    // Query Store 2: remains completely untouched, inheriting catalog defaults
    const res2 = await getStoreMedicineSettings(db, ctx2, store2.id, [med.id]);
    const setting2 = res2.get(med.id);
    expect(setting2?.reorderLevel).toBe(10);
    expect(setting2?.maxStock).toBe(100);
    expect(setting2?.salePrice).toBe(8000);
    expect(setting2?.salePriceSource).toBe("catalog_default");
    expect(setting2?.hasStoreOverrides).toBe(false);

    // Master medicine in catalog is completely unchanged
    const [rawMed] = await db
      .select()
      .from(schema.medicines)
      .where(eq(schema.medicines.id, med.id));
    expect(rawMed.salePrice).toBe(8000);
    expect(rawMed.reorderLevel).toBe(10);
  });

  it("assigns rack per branch and rejects cross-store rack assignment", async () => {
    const tenant = await makeTenant(db);
    const store1 = await makeStore(db, tenant.id, { name: "Store Alpha", code: "SA01" });
    const store2 = await makeStore(db, tenant.id, { name: "Store Beta", code: "SB01" });
    const user = await makeUser(db);
    const ctx1 = createAuthCtx(tenant.id, store1.id, user.id);

    const med = await makeMedicine(db, tenant.id, { name: "Cetirizine 10mg" });

    // Create Rack in Store 1
    const [rack1] = await db
      .insert(schema.racks)
      .values({
        tenantId: tenant.id,
        storeId: store1.id,
        code: "R1-S1",
        name: "Alpha Counter Rack",
      })
      .returning();

    // Create Rack in Store 2
    const [rack2] = await db
      .insert(schema.racks)
      .values({
        tenantId: tenant.id,
        storeId: store2.id,
        code: "R2-B1",
        name: "Beta Storage Rack",
      })
      .returning();

    // Valid: Store 1 assigns Rack 1
    const updated = await updateStoreMedicineSettings(db, ctx1, store1.id, med.id, {
      rackId: rack1.id,
    });
    expect(updated.rackId).toBe(rack1.id);
    expect(updated.rackCode).toBe("R1-S1");

    // Invalid: Store 1 attempts to assign Rack 2 (belongs to Store 2)
    await expect(
      updateStoreMedicineSettings(db, ctx1, store1.id, med.id, {
        rackId: rack2.id,
      }),
    ).rejects.toThrow("Rack not found.");
  });

  it("records audit log on store medicine settings update", async () => {
    const tenant = await makeTenant(db);
    const store = await makeStore(db, tenant.id, { name: "Audit Store", code: "AUD1" });
    const user = await makeUser(db);
    const ctx = createAuthCtx(tenant.id, store.id, user.id);

    const med = await makeMedicine(db, tenant.id, { name: "Metformin 500mg" });

    await updateStoreMedicineSettings(db, ctx, store.id, med.id, {
      reorderLevel: 50,
      salePriceOverride: 6000,
    });

    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.tenantId, tenant.id),
          eq(schema.auditLogs.action, "store_medicine_settings_update"),
          eq(schema.auditLogs.entityId, `${store.id}:${med.id}`),
        ),
      );

    expect(audit).toBeDefined();
    expect(audit.userId).toBe(user.id);
    expect(audit.newValue).toMatchObject({
      reorderLevel: 50,
      salePriceOverride: 6000,
    });
  });

  it("clears rackId on rack deletion without deleting the store medicine settings row", async () => {
    const tenant = await makeTenant(db);
    const store = await makeStore(db, tenant.id, { name: "Rack Store", code: "RCK1" });
    const user = await makeUser(db);
    const ctx = createAuthCtx(tenant.id, store.id, user.id);

    const med = await makeMedicine(db, tenant.id, { name: "Azithromycin 500mg" });

    const [rack] = await db
      .insert(schema.racks)
      .values({
        tenantId: tenant.id,
        storeId: store.id,
        code: "DEL-R1",
        name: "Temporary Rack",
      })
      .returning();

    await updateStoreMedicineSettings(db, ctx, store.id, med.id, {
      rackId: rack.id,
      reorderLevel: 35,
    });

    // Delete rack directly via DB constraint verification (ON DELETE SET NULL)
    await db.delete(schema.racks).where(eq(schema.racks.id, rack.id));

    const [setting] = await db
      .select()
      .from(schema.storeMedicineSettings)
      .where(
        and(
          eq(schema.storeMedicineSettings.storeId, store.id),
          eq(schema.storeMedicineSettings.medicineId, med.id),
        ),
      );

    expect(setting).toBeDefined();
    expect(setting.rackId).toBeNull();
    expect(setting.reorderLevel).toBe(35);
  });
});
