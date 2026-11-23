import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { PosDB } from "@/offline/db";
import { OfflinePosDataSource } from "@/offline/offline-datasource";

describe("OfflinePosDataSource.searchItems rxRequired derivation", () => {
  let db: PosDB;
  let ds: OfflinePosDataSource;

  beforeEach(async () => {
    db = new PosDB();
    await db.medicines.clear();
    await db.batches.clear();
    await db.provisionalAllocations.clear();
    ds = new OfflinePosDataSource(db, {
      tenantId: "t1",
      storeId: "s1",
      deviceId: "d1",
      cashierId: "u1",
    });

    const now = new Date().toISOString();
    await db.medicines.bulkPut([
      {
        id: "med-otc",
        tenantId: "t1",
        name: "Paracetamol 500mg",
        genericName: "Paracetamol",
        schedule: "none",
        isActive: true,
        updatedAt: now,
      },
      {
        id: "med-h",
        tenantId: "t1",
        name: "Atorva 20mg",
        genericName: "Atorvastatin",
        schedule: "H",
        isActive: true,
        updatedAt: now,
      },
    ]);

    await db.batches.bulkPut([
      {
        id: "b-otc",
        storeId: "s1",
        medicineId: "med-otc",
        batchNumber: "B-PARA-001",
        expiryDate: "2028-01-01",
        qtyOnHand: 100,
        mrpPaise: 1500,
        saleRatePaise: 1500,
        isActive: true,
        updatedAt: now,
      },
      {
        id: "b-h",
        storeId: "s1",
        medicineId: "med-h",
        batchNumber: "B-ATOR-001",
        expiryDate: "2028-01-01",
        qtyOnHand: 50,
        mrpPaise: 21550,
        saleRatePaise: 21550,
        isActive: true,
        updatedAt: now,
      },
    ]);
  });

  it("marks schedule='none' OTC medicines as rxRequired=false and Schedule H as rxRequired=true", async () => {
    const otcResults = await ds.searchItems("Paracetamol");
    expect(otcResults).toHaveLength(1);
    expect(otcResults[0].medicine.rxRequired).toBe(false);

    const hResults = await ds.searchItems("Atorva");
    expect(hResults).toHaveLength(1);
    expect(hResults[0].medicine.rxRequired).toBe(true);
  });
});
