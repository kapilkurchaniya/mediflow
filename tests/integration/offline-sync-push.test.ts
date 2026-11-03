import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PosDB, resetPosDb } from "@/offline/db";
import { createOfflineSale } from "@/offline/offline-sale";
import { pushOfflineSales, recoverStaleSyncingSales } from "@/offline/push";
import type { IngestOfflineSalesResponse } from "@/server/domain/sync/types";

describe("Offline Sync Push Engine", () => {
  let db: PosDB;

  const deviceConfig = {
    tenantId: "tenant-1",
    storeId: "store-1",
    deviceId: "dev-1",
    deviceCode: "01",
    storeCode: "M1",
    deviceToken: "dev-token-abc",
  };

  beforeEach(async () => {
    db = new PosDB(`test-push-${Date.now()}-${Math.random()}`);

    // Seed reservation block
    await db.numberBlocks.put({
      id: "res-push-1",
      storeId: "store-1",
      deviceId: "dev-1",
      fiscalYear: "2025-2026",
      reservationId: "res-push-1",
      storeCode: "M1",
      deviceCode: "01",
      startSeq: 1,
      endSeq: 100,
      nextSeq: 1,
      active: 1,
    });
  });

  afterEach(async () => {
    await resetPosDb(db);
  });

  it("pushes pending sales, transitions status to synced, and clears provisional allocations", async () => {
    const sale = await createOfflineSale(db, {
      storeId: "store-1",
      deviceId: "dev-1",
      cashierId: "00000000-0000-0000-0000-000000000001",
      lines: [{ batchId: "b1", medicineId: "m1", qty: 5, ratePaise: 1000 }],
      payments: [{ method: "cash", amountPaise: 5000 }],
    });

    // Provisional allocation exists
    const allocBefore = await db.provisionalAllocations
      .where("clientSaleId")
      .equals(sale.clientSaleId)
      .toArray();
    expect(allocBefore).toHaveLength(1);

    const mockResponse: IngestOfflineSalesResponse = {
      results: [
        {
          clientSaleId: sale.clientSaleId,
          status: "created",
          saleId: "server-sale-uuid-1",
          invoiceNo: sale.invoiceNo,
          total: 5000,
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const pushResult = await pushOfflineSales(
      db,
      deviceConfig,
      50,
      mockFetch as unknown as typeof fetch,
    );

    expect(pushResult.pushed).toBe(1);
    expect(pushResult.created).toBe(1);
    expect(pushResult.rejected).toBe(0);

    // Pending sale is now synced
    const savedSale = await db.pendingSales.get(sale.clientSaleId);
    expect(savedSale?.status).toBe("synced");
    expect(savedSale?.serverSaleId).toBe("server-sale-uuid-1");

    // Provisional allocation was cleared
    const allocAfter = await db.provisionalAllocations
      .where("clientSaleId")
      .equals(sale.clientSaleId)
      .toArray();
    expect(allocAfter).toHaveLength(0);
  });

  it("handles duplicate sales gracefully without failing the batch", async () => {
    const sale = await createOfflineSale(db, {
      storeId: "store-1",
      deviceId: "dev-1",
      cashierId: "00000000-0000-0000-0000-000000000001",
      lines: [{ batchId: "b1", medicineId: "m1", qty: 2, ratePaise: 2000 }],
      payments: [{ method: "cash", amountPaise: 4000 }],
    });

    const mockResponse: IngestOfflineSalesResponse = {
      results: [
        {
          clientSaleId: sale.clientSaleId,
          status: "duplicate",
          saleId: "existing-sale-uuid",
          invoiceNo: sale.invoiceNo,
          total: 4000,
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const pushResult = await pushOfflineSales(
      db,
      deviceConfig,
      50,
      mockFetch as unknown as typeof fetch,
    );

    expect(pushResult.duplicates).toBe(1);
    const saved = await db.pendingSales.get(sale.clientSaleId);
    expect(saved?.status).toBe("synced");
  });

  it("records syncConflicts and marks sale as rejected on server rejection", async () => {
    const sale = await createOfflineSale(db, {
      storeId: "store-1",
      deviceId: "dev-1",
      cashierId: "00000000-0000-0000-0000-000000000001",
      lines: [{ batchId: "b1", medicineId: "m1", qty: 2, ratePaise: 2000 }],
      payments: [{ method: "cash", amountPaise: 4000 }],
    });

    const mockResponse: IngestOfflineSalesResponse = {
      results: [
        {
          clientSaleId: sale.clientSaleId,
          status: "rejected",
          code: "INVOICE_SEQUENCE_OUT_OF_RANGE",
          error: "Sequence 1 is not reserved for this device.",
        },
      ],
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    const pushResult = await pushOfflineSales(
      db,
      deviceConfig,
      50,
      mockFetch as unknown as typeof fetch,
    );

    expect(pushResult.rejected).toBe(1);
    const saved = await db.pendingSales.get(sale.clientSaleId);
    expect(saved?.status).toBe("rejected");
    expect(saved?.lastError).toContain("Sequence 1 is not reserved");

    // Check conflict entry in Dexie
    const conflicts = await db.syncConflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].clientSaleId).toBe(sale.clientSaleId);
    expect(conflicts[0].conflictType).toBe("rejected_sale");
  });

  it("recovers stale syncing sales after simulated tab crash", async () => {
    // Insert a sale in 'syncing' status with an updatedAt 70 seconds ago
    const staleTime = new Date(Date.now() - 70_000).toISOString();
    await db.pendingSales.put({
      clientSaleId: "stale-sale-1",
      storeId: "store-1",
      deviceId: "dev-1",
      status: "syncing",
      createdAt: staleTime,
      updatedAt: staleTime,
      retryCount: 0,
      nextRetryAt: staleTime,
      invoiceNo: "M101-2526-000099",
      fiscalYear: "2025-2026",
      sequenceNumber: 99,
      payload: {
        clientSaleId: "stale-sale-1",
        invoiceNo: "M101-2526-000099",
        fiscalYear: "2025-2026",
        sequenceNumber: 99,
        createdBy: "00000000-0000-0000-0000-000000000001",
        completedAt: staleTime,
        lines: [{ batchId: "b1", medicineId: "m1", qty: 1 }],
      },
    });

    const recoveredCount = await recoverStaleSyncingSales(db, 60_000);
    expect(recoveredCount).toBe(1);

    const recoveredSale = await db.pendingSales.get("stale-sale-1");
    expect(recoveredSale?.status).toBe("pending");
    expect(recoveredSale?.retryCount).toBe(1);
  });

  it("applies exponential backoff when push request fails", async () => {
    await createOfflineSale(db, {
      storeId: "store-1",
      deviceId: "dev-1",
      cashierId: "00000000-0000-0000-0000-000000000001",
      lines: [{ batchId: "b1", medicineId: "m1", qty: 1, ratePaise: 1000 }],
      payments: [{ method: "cash", amountPaise: 1000 }],
    });

    const mockFetch = vi.fn().mockRejectedValue(new Error("Network connection dropped"));

    const pushResult = await pushOfflineSales(
      db,
      deviceConfig,
      50,
      mockFetch as unknown as typeof fetch,
    );

    expect(pushResult.errors).toHaveLength(1);
    expect(pushResult.errors?.[0]).toContain("Network connection dropped");

    const pending = await db.pendingSales.where("status").equals("pending").first();
    expect(pending?.status).toBe("pending");
    expect(pending?.retryCount).toBe(1);
    expect(new Date(pending?.nextRetryAt ?? 0).getTime()).toBeGreaterThan(Date.now());
  });
});
