import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PosDB, resetPosDb } from "@/offline/db";
import { runSyncCycle, getSyncStatusSummary } from "@/offline/sync";
import { createOfflineSale } from "@/offline/offline-sale";
import type { IngestOfflineSalesResponse, SyncPullResponse, ReserveNumbersResponse } from "@/server/domain/sync/types";

describe("Sync Coordinator & Lifecycle", () => {
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
    db = new PosDB(`test-coord-${Date.now()}-${Math.random()}`);
    await db.setDeviceConfig(deviceConfig);

    // Seed a nearly exhausted block (1 remaining) to test auto-replenishment
    await db.numberBlocks.put({
      id: "res-init",
      storeId: "store-1",
      deviceId: "dev-1",
      fiscalYear: "2025-2026",
      reservationId: "res-init",
      storeCode: "M1",
      deviceCode: "01",
      startSeq: 10,
      endSeq: 10,
      nextSeq: 10,
      active: 1,
    });
  });

  afterEach(async () => {
    await resetPosDb(db);
  });

  it("coordinates push, pull, and auto-replenishment in a single sync cycle", async () => {
    // 1. Create a sale (consumes seq 10, exhausting the initial block)
    await createOfflineSale(db, {
      storeId: "store-1",
      deviceId: "dev-1",
      cashierId: "00000000-0000-0000-0000-000000000001",
      lines: [{ batchId: "b1", medicineId: "m1", qty: 1, ratePaise: 1000 }],
      payments: [{ method: "cash", amountPaise: 1000 }],
    });

    const statusBefore = await getSyncStatusSummary(db, "store-1", "dev-1");
    expect(statusBefore.pendingCount).toBe(1);
    expect(statusBefore.remainingInvoiceNumbers).toBe(0);

    // Mock fetch for push, pull, and replenishment
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/sync/sales")) {
        const pushRes: IngestOfflineSalesResponse = {
          results: [
            {
              clientSaleId: "ignored",
              status: "created",
              saleId: "srv-sale-1",
              invoiceNo: "M101-2526-000010",
              total: 1000,
            },
          ],
        };
        return { ok: true, json: async () => pushRes };
      }

      if (url.includes("/api/sync/pull")) {
        const emptyPage = { items: [], nextCursor: null, hasMore: false };
        const pullRes: SyncPullResponse = {
          sessionId: "sess-coord-1",
          serverTime: "2026-11-03T12:00:00.000Z",
          snapshotTime: "2026-11-03T12:00:00.000Z",
          expiresAt: "2026-11-03T12:15:00.000Z",
          entities: {
            medicines: emptyPage,
            batches: emptyPage,
            customers: emptyPage,
            doctors: emptyPage,
            schemes: emptyPage,
            storeMedicineSettings: emptyPage,
            storeSettings: emptyPage,
          },
        };
        return { ok: true, json: async () => pullRes };
      }

      if (url.includes("/api/sync/reserve-numbers")) {
        const reserveRes: ReserveNumbersResponse = {
          reservationId: "res-replenished-2",
          fiscalYear: "2025-2026",
          storeCode: "M1",
          deviceCode: "01",
          startSeq: 11,
          endSeq: 210,
          count: 200,
          sampleStartInvoiceNo: "M101-2526-000011",
          sampleEndInvoiceNo: "M101-2526-000210",
        };
        return { ok: true, json: async () => reserveRes };
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    const cycleResult = await runSyncCycle(db, deviceConfig, mockFetch as unknown as typeof fetch);

    expect(cycleResult).not.toBeNull();
    expect(cycleResult?.pushed.pushed).toBe(1);
    expect(cycleResult?.pulled.success).toBe(true);
    expect(cycleResult?.replenished).toBe(true);

    const statusAfter = await getSyncStatusSummary(db, "store-1", "dev-1");
    expect(statusAfter.pendingCount).toBe(0);
    expect(statusAfter.remainingInvoiceNumbers).toBe(200);
    expect(statusAfter.lastSyncAt).not.toBeNull();
  });
});
