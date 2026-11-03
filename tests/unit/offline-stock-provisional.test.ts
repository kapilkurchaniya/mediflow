import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PosDB, resetPosDb } from "@/offline/db";
import { searchMedicines, getBatchAvailableStock } from "@/offline/search";
import { createOfflineSale } from "@/offline/offline-sale";

describe("Provisional Stock Ledger & Offline Sales", () => {
  let db: PosDB;

  beforeEach(async () => {
    db = new PosDB(`test-stock-${Date.now()}-${Math.random()}`);

    // Seed reservation block
    await db.numberBlocks.put({
      id: "res-stock-1",
      storeId: "store-1",
      deviceId: "dev-1",
      fiscalYear: "2025-2026",
      reservationId: "res-stock-1",
      storeCode: "M1",
      deviceCode: "01",
      startSeq: 1,
      endSeq: 100,
      nextSeq: 1,
      active: 1,
    });

    // Seed medicine and two batches (one expiring earlier)
    await db.medicines.put({
      id: "med-paracetamol",
      tenantId: "tenant-1",
      name: "Paracetamol 650mg",
      genericName: "Paracetamol",
      barcode: "8901234567890",
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    await db.batches.bulkPut([
      {
        id: "batch-exp-2026",
        storeId: "store-1",
        medicineId: "med-paracetamol",
        batchNumber: "B2026",
        expiryDate: "2026-08-31",
        mrpPaise: 3000,
        saleRatePaise: 2800,
        qtyOnHand: 50,
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "batch-exp-2027",
        storeId: "store-1",
        medicineId: "med-paracetamol",
        batchNumber: "B2027",
        expiryDate: "2027-12-31",
        mrpPaise: 3000,
        saleRatePaise: 2800,
        qtyOnHand: 100,
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
    ]);
  });

  afterEach(async () => {
    await resetPosDb(db);
  });

  it("returns batches in FEFO order with full available stock", async () => {
    const searchRes = await searchMedicines(db, "tenant-1", "store-1", "paracetamol");
    expect(searchRes).toHaveLength(1);
    expect(searchRes[0].batches).toHaveLength(2);

    // FEFO order: B2026 before B2027
    expect(searchRes[0].batches[0].batch.batchNumber).toBe("B2026");
    expect(searchRes[0].batches[0].availableQty).toBe(50);
    expect(searchRes[0].batches[1].batch.batchNumber).toBe("B2027");
    expect(searchRes[0].batches[1].availableQty).toBe(100);
    expect(searchRes[0].totalAvailableStock).toBe(150);
  });

  it("decrements available stock provisionally without mutating batch.qtyOnHand", async () => {
    const cashierId = "00000000-0000-0000-0000-000000000001";

    const saleResult = await createOfflineSale(db, {
      storeId: "store-1",
      deviceId: "dev-1",
      cashierId,
      lines: [
        {
          batchId: "batch-exp-2026",
          medicineId: "med-paracetamol",
          qty: 15,
          ratePaise: 2800,
        },
      ],
      payments: [
        {
          method: "cash",
          amountPaise: 15 * 2800,
        },
      ],
    });

    expect(saleResult.invoiceNo).toBe("M101-2526-000001");

    // Authoritative batch row still has serverQty = 50
    const rawBatch = await db.batches.get("batch-exp-2026");
    expect(rawBatch?.qtyOnHand).toBe(50);

    // Available stock query reflects the provisional allocation (50 - 15 = 35)
    const stockSummary = await getBatchAvailableStock(db, "store-1", "batch-exp-2026");
    expect(stockSummary?.serverQty).toBe(50);
    expect(stockSummary?.allocatedQty).toBe(15);
    expect(stockSummary?.availableQty).toBe(35);
  });

  it("prevents delta pull from restoring stock consumed by pending local sales", async () => {
    const cashierId = "00000000-0000-0000-0000-000000000001";

    // 1. Create offline sale consuming 20 units
    await createOfflineSale(db, {
      storeId: "store-1",
      deviceId: "dev-1",
      cashierId,
      lines: [
        {
          batchId: "batch-exp-2026",
          medicineId: "med-paracetamol",
          qty: 20,
          ratePaise: 2800,
        },
      ],
      payments: [{ method: "cash", amountPaise: 20 * 2800 }],
    });

    // 2. Simulate a server delta pull that returns server state as of snapshot time (server still saw 50)
    await db.batches.put({
      id: "batch-exp-2026",
      storeId: "store-1",
      medicineId: "med-paracetamol",
      batchNumber: "B2026",
      expiryDate: "2026-08-31",
      mrpPaise: 3000,
      saleRatePaise: 2800,
      qtyOnHand: 50, // server snapshot
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    // 3. Available stock MUST still be 30 (50 - 20), NOT jumped back to 50!
    const stockSummary = await getBatchAvailableStock(db, "store-1", "batch-exp-2026");
    expect(stockSummary?.availableQty).toBe(30);
  });
});
