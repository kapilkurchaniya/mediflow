import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PosDB, resetPosDb } from "@/offline/db";
import {
  formatOfflineInvoiceNo,
  getOfflineFiscalYear,
  allocateNextInvoiceNumber,
  replenishNumberBlock,
  OfflineBlockExhaustedError,
} from "@/offline/invoice-series";
import type { ReserveNumbersResponse } from "@/server/domain/sync/types";

describe("Offline Invoice Series Allocation", () => {
  let db: PosDB;

  beforeEach(() => {
    db = new PosDB(`test-series-${Date.now()}-${Math.random()}`);
  });

  afterEach(async () => {
    await resetPosDb(db);
  });

  it("formats canonical invoice numbers under 16 characters", () => {
    const formatted = formatOfflineInvoiceNo({
      storeCode: "M1",
      deviceCode: "01",
      fiscalYear: "2025-2026",
      sequence: 42,
    });
    expect(formatted).toBe("M101-2526-000042");
    expect(formatted.length).toBeLessThanOrEqual(16);
  });

  it("derives the correct financial year", () => {
    const aprilDate = new Date(2026, 3, 1); // 1 April 2026
    const marchDate = new Date(2026, 2, 31); // 31 March 2026
    expect(getOfflineFiscalYear(aprilDate)).toBe("2026-2027");
    expect(getOfflineFiscalYear(marchDate)).toBe("2025-2026");
  });

  it("allocates sequentially and signals replenishment threshold", async () => {
    // Seed a block of 3 numbers
    await db.numberBlocks.put({
      id: "res-1",
      storeId: "store-1",
      deviceId: "dev-1",
      fiscalYear: "2025-2026",
      reservationId: "res-1",
      storeCode: "M1",
      deviceCode: "01",
      startSeq: 1,
      endSeq: 3,
      nextSeq: 1,
      active: 1,
    });

    const inv1 = await allocateNextInvoiceNumber(db, "store-1", "dev-1");
    expect(inv1.invoiceNo).toBe("M101-2526-000001");
    expect(inv1.sequenceNumber).toBe(1);
    expect(inv1.remaining).toBe(2);
    expect(inv1.shouldReplenish).toBe(true); // < 50

    const inv2 = await allocateNextInvoiceNumber(db, "store-1", "dev-1");
    expect(inv2.invoiceNo).toBe("M101-2526-000002");
    expect(inv2.sequenceNumber).toBe(2);

    const inv3 = await allocateNextInvoiceNumber(db, "store-1", "dev-1");
    expect(inv3.invoiceNo).toBe("M101-2526-000003");
    expect(inv3.sequenceNumber).toBe(3);
    expect(inv3.remaining).toBe(0);

    // Block exhausted
    await expect(allocateNextInvoiceNumber(db, "store-1", "dev-1")).rejects.toThrow(
      OfflineBlockExhaustedError,
    );
  });

  it("handles concurrent multi-tab allocation without sequence collisions", async () => {
    // Seed a block of 25 numbers
    await db.numberBlocks.put({
      id: "res-conc",
      storeId: "store-1",
      deviceId: "dev-1",
      fiscalYear: "2025-2026",
      reservationId: "res-conc",
      storeCode: "M1",
      deviceCode: "01",
      startSeq: 101,
      endSeq: 125,
      nextSeq: 101,
      active: 1,
    });

    // Fire 20 parallel allocation requests
    const promises = Array.from({ length: 20 }).map(() =>
      allocateNextInvoiceNumber(db, "store-1", "dev-1"),
    );
    const results = await Promise.all(promises);

    const issuedNumbers = results.map((r) => r.invoiceNo);
    const uniqueNumbers = new Set(issuedNumbers);
    expect(uniqueNumbers.size).toBe(20);

    const seqs = results.map((r) => r.sequenceNumber).sort((a, b) => a - b);
    expect(seqs[0]).toBe(101);
    expect(seqs[19]).toBe(120);
  });

  it("replenishes block via mock fetch and enables continued billing", async () => {
    const mockResponse: ReserveNumbersResponse = {
      reservationId: "res-server-99",
      fiscalYear: "2025-2026",
      storeCode: "ST",
      deviceCode: "02",
      startSeq: 1,
      endSeq: 200,
      count: 200,
      sampleStartInvoiceNo: "ST02-2526-000001",
      sampleEndInvoiceNo: "ST02-2526-000200",
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as unknown as Response);

    await replenishNumberBlock(
      db,
      {
        tenantId: "t1",
        storeId: "s1",
        deviceId: "d1",
        deviceCode: "02",
        storeCode: "ST",
        deviceToken: "token-abc",
      },
      200,
      mockFetch as unknown as typeof fetch,
    );

    const allocated = await allocateNextInvoiceNumber(db, "s1", "d1");
    expect(allocated.invoiceNo).toBe("ST02-2526-000001");
    expect(allocated.sequenceNumber).toBe(1);
    expect(allocated.remaining).toBe(199);
  });
});
