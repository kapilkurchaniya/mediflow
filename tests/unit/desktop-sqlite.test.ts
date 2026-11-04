import { describe, it, expect, beforeEach } from "vitest";
import {
  DesktopSqliteStorage,
  SQLITE_WAL_PRAGMAS,
  SQLITE_SCHEMA_DDL,
} from "@/desktop/sqlite-storage";
import type { OfflineMedicine, OfflineBatch, OfflinePendingSale } from "@/offline/types";

describe("Desktop SQLite Storage & WAL Engine", () => {
  let storage: DesktopSqliteStorage;

  beforeEach(async () => {
    storage = new DesktopSqliteStorage();
    await storage.initialize();
  });

  it("verifies WAL mode and synchronous pragmas in DDL", () => {
    expect(SQLITE_WAL_PRAGMAS).toContain("journal_mode = WAL");
    expect(SQLITE_WAL_PRAGMAS).toContain("synchronous = NORMAL");
    expect(SQLITE_SCHEMA_DDL).toContain("desktop_medicines");
    expect(SQLITE_SCHEMA_DDL).toContain("desktop_batches");
    expect(SQLITE_SCHEMA_DDL).toContain("desktop_pending_sales");
  });

  it("ingests catalog items and searches medicines locally", async () => {
    const med: OfflineMedicine = {
      id: "med-1",
      tenantId: "t-1",
      name: "Paracetamol 650mg",
      genericName: "Paracetamol",
      barcode: "89010001",
      schedule: "NONE",
      hsnCode: "300490",
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    const batch: OfflineBatch = {
      id: "b-1",
      storeId: "s-1",
      medicineId: "med-1",
      batchNumber: "BATCH-01",
      expiryDate: "2028-05-01",
      qtyOnHand: 100,
      mrpPaise: 3000,
      saleRatePaise: 2800,
      isActive: true,
      updatedAt: new Date().toISOString(),
    };

    await storage.ingestCatalog([med], [batch]);

    const results = await storage.searchMedicines("paracetamol");
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("Paracetamol 650mg");
  });

  it("saves pending sales and transitions status to synced upon outbox push", async () => {
    const pendingSale: OfflinePendingSale = {
      clientSaleId: "sale-uuid-1234",
      storeId: "s-1",
      deviceId: "dev-01",
      invoiceNo: "AP01-2627-000101",
      fiscalYear: "2026-2027",
      sequenceNumber: 101,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
      nextRetryAt: new Date().toISOString(),
      payload: {
        clientSaleId: "sale-uuid-1234",
        invoiceNo: "AP01-2627-000101",
        fiscalYear: "2026-2027",
        sequenceNumber: 101,
        createdBy: "cashier-1",
        completedAt: new Date().toISOString(),
        lines: [],
        payments: [{ method: "cash", amount: 1500 }],
        billDiscountPaise: 0,
      },
    };

    await storage.savePendingSale(pendingSale);

    const pendingList = await storage.getPendingSales();
    expect(pendingList).toHaveLength(1);
    expect(pendingList[0].invoiceNo).toBe("AP01-2627-000101");

    await storage.markSaleSynced("sale-uuid-1234");
    expect(pendingSale.status).toBe("synced");
  });
});
