import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PosDB, resetPosDb } from "@/offline/db";
import { OfflinePosDataSource } from "@/offline/offline-datasource";

describe("OfflinePosDataSource", () => {
  let db: PosDB;
  let ds: OfflinePosDataSource;
  const tenantId = "t1";
  const storeId = "s1";
  const deviceId = "dev01";
  const cashierId = "cashier-1";

  beforeEach(async () => {
    db = new PosDB(`test-ds-${Date.now()}-${Math.random()}`);
    await db.open();

    ds = new OfflinePosDataSource(db, {
      tenantId,
      storeId,
      deviceId,
      cashierId,
    });

    // Seed test data
    await db.medicines.bulkAdd([
      {
        id: "m1",
        tenantId,
        name: "Paracetamol 500mg",
        genericName: "Paracetamol",
        barcode: "8901234567890",
        schedule: "OTC",
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "m2",
        tenantId,
        name: "Amoxicillin 250mg",
        genericName: "Amoxicillin",
        schedule: "H",
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
    ]);

    await db.batches.bulkAdd([
      {
        id: "b1",
        storeId,
        medicineId: "m1",
        batchNumber: "B-2025-01",
        expiryDate: "2026-12-31",
        mrpPaise: 2500,
        saleRatePaise: 2000,
        qtyOnHand: 50,
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
      {
        id: "b2",
        storeId,
        medicineId: "m1",
        batchNumber: "B-2025-02",
        expiryDate: "2026-06-30", // earlier expiry
        mrpPaise: 2500,
        saleRatePaise: 2000,
        qtyOnHand: 20,
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
    ]);

    await db.customers.bulkAdd([
      {
        id: "c1",
        tenantId,
        name: "Ramesh Sharma",
        phone: "9876543210",
        creditLimitPaise: 100000, // ₹1,000
        currentCreditPaise: 20000, // ₹200
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
    ]);

    await db.doctors.bulkAdd([
      {
        id: "d1",
        tenantId,
        name: "Dr. Arvind Mehta",
        regNo: "MCI-45890",
        isActive: true,
        updatedAt: new Date().toISOString(),
      },
    ]);

    await db.numberBlocks.add({
      id: "nb-1",
      storeId,
      deviceId,
      storeCode: "M1",
      deviceCode: "01",
      fiscalYear: "2025-2026",
      startSeq: 1,
      endSeq: 100,
      nextSeq: 1,
      active: 1,
      reservationId: "res-1",
    });
  });

  afterEach(async () => {
    await resetPosDb(db);
  });

  it("searches medicines and orders batches by FEFO", async () => {
    const results = await ds.searchItems("Paracetamol");
    expect(results).toHaveLength(1);
    expect(results[0].medicine.name).toBe("Paracetamol 500mg");

    // Earlier expiry (b2) should appear first
    expect(results[0].batches).toHaveLength(2);
    expect(results[0].batches[0].id).toBe("b2");
    expect(results[0].batches[0].qtyOnHand).toBe(20);
    expect(results[0].batches[1].id).toBe("b1");
  });

  it("searches customers and doctors from local Dexie", async () => {
    const customers = await ds.getCustomers("Ramesh");
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe("Ramesh Sharma");
    expect(customers[0].creditLimit).toBe(1000);

    const doctors = await ds.getDoctors("Arvind");
    expect(doctors).toHaveLength(1);
    expect(doctors[0].name).toBe("Dr. Arvind Mehta");
    expect(doctors[0].regNo).toBe("MCI-45890");
  });

  it("defers customer creation while offline", async () => {
    const res = await ds.createQuickCustomer();
    expect(res.error).toBeDefined();
    expect(res.error).toContain("disabled while offline");
  });

  it("blocks loyalty points redemption while offline", async () => {
    const res = await ds.createSale({
      customerId: "c1",
      doctorName: "Dr. Mehta",
      items: [
        {
          batchId: "b2",
          medicineId: "m1",
          qty: 2,
          rate: 20,
          discountBp: 0,
        },
      ],
      paymentMethod: "cash",
      amountPaid: 40,
      redeemPoints: 10,
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain("Loyalty points redemption is disabled while offline");
  });

  it("enforces customer credit limit on offline credit sales", async () => {
    // Customer limit: ₹1,000, current: ₹200. Attempting ₹900 (total ₹1,100 > ₹1,000)
    const res = await ds.createSale({
      customerId: "c1",
      doctorName: "Dr. Mehta",
      items: [
        {
          batchId: "b2",
          medicineId: "m1",
          qty: 45,
          rate: 20,
          discountBp: 0,
        },
      ],
      paymentMethod: "credit",
      amountPaid: 900,
    });

    expect(res.error).toBeDefined();
    expect(res.error).toContain("Credit limit exceeded");
  });

  it("creates offline sale with consecutive invoice and provisional allocations", async () => {
    const res = await ds.createSale({
      customerId: "c1",
      doctorName: "Dr. Arvind Mehta",
      items: [
        {
          batchId: "b2",
          medicineId: "m1",
          qty: 5,
          rate: 20,
          discountBp: 0,
        },
      ],
      paymentMethod: "cash",
      amountPaid: 100,
    });
    expect(res.saleId).toBeDefined();
    expect(res.invoiceNo).toBe("M101-2526-000001");

    // Check pendingSales outbox in Dexie
    const pending = await db.pendingSales.get(res.saleId!);
    expect(pending).toBeDefined();
    expect(pending?.status).toBe("pending");
    expect(pending?.invoiceNo).toBe("M101-2526-000001");

    // Check provisional stock allocation
    const alloc = await db.provisionalAllocations
      .where("[storeId+batchId]")
      .equals([storeId, "b2"])
      .first();
    expect(alloc).toBeDefined();
    expect(alloc?.qty).toBe(5);

    // Verify search now reflects deducted provisional stock
    const searchAfter = await ds.searchItems("Paracetamol");
    const b2After = searchAfter[0].batches.find((b) => b.id === "b2");
    expect(b2After?.qtyOnHand).toBe(15); // 20 - 5 = 15
  });
});
