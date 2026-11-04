import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PosDB, resetPosDb } from "@/offline/db";

describe("PosDB (IndexedDB Foundation)", () => {
  let db: PosDB;

  beforeEach(() => {
    db = new PosDB(`test-mediflow-${Date.now()}-${Math.random()}`);
  });

  afterEach(async () => {
    await resetPosDb(db);
  });

  it("initializes all required offline tables", async () => {
    await db.open();
    const tableNames = db.tables.map((t) => t.name).sort();
    expect(tableNames).toEqual(
      [
        "batches",
        "customers",
        "doctors",
        "medicines",
        "meta",
        "numberBlocks",
        "pendingSales",
        "provisionalAllocations",
        "schemes",
        "storeMedicineSettings",
        "storeSettings",
        "syncConflicts",
      ].sort(),
    );
  });

  it("stores and retrieves meta and device credentials correctly", async () => {
    await db.setDeviceConfig({
      tenantId: "tenant-1",
      storeId: "store-1",
      deviceId: "dev-1",
      deviceCode: "01",
      storeCode: "M1",
      deviceToken: "secret-token-123",
    });

    const retrieved = await db.getDeviceConfig();
    expect(retrieved).not.toBeNull();
    expect(retrieved?.tenantId).toBe("tenant-1");
    expect(retrieved?.deviceCode).toBe("01");
    expect(retrieved?.deviceToken).toBe("secret-token-123");
  });

  it("supports compound index lookups for active store batches", async () => {
    await db.batches.bulkAdd([
      {
        id: "b1",
        storeId: "store-1",
        medicineId: "med-1",
        batchNumber: "BAT001",
        expiryDate: "2027-12-31",
        mrpPaise: 10000,
        saleRatePaise: 9000,
        qtyOnHand: 50,
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "b2",
        storeId: "store-1",
        medicineId: "med-1",
        batchNumber: "BAT002",
        expiryDate: "2026-06-30",
        mrpPaise: 10000,
        saleRatePaise: 9000,
        qtyOnHand: 20,
        isActive: false,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "b3",
        storeId: "store-2",
        medicineId: "med-1",
        batchNumber: "BAT003",
        expiryDate: "2028-01-31",
        mrpPaise: 10000,
        saleRatePaise: 9000,
        qtyOnHand: 10,
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
    ]);

    // Query batches for store-1 and med-1
    const med1Store1 = await db.batches
      .where("[storeId+medicineId]")
      .equals(["store-1", "med-1"])
      .toArray();
    expect(med1Store1).toHaveLength(2);

    // Query active batches for store-1
    // Dexie boolean index queries use 1 for true in some adapters or true directly
    const store1All = await db.batches
      .where("storeId")
      .equals("store-1")
      .toArray();
    const store1Active = store1All.filter((b) => b.isActive);
    expect(store1Active).toHaveLength(1);
    expect(store1Active[0].batchNumber).toBe("BAT001");
  });
});
