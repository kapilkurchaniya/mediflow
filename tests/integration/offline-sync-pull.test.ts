import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PosDB, resetPosDb } from "@/offline/db";
import { pullSyncDeltas } from "@/offline/pull";
import type { SyncPullResponse } from "@/server/domain/sync/types";

describe("Offline Sync Pull Engine", () => {
  let db: PosDB;

  const deviceConfig = {
    tenantId: "tenant-1",
    storeId: "store-1",
    deviceId: "dev-1",
    deviceCode: "01",
    storeCode: "M1",
    deviceToken: "dev-token-abc",
  };

  beforeEach(() => {
    db = new PosDB(`test-pull-${Date.now()}-${Math.random()}`);
  });

  afterEach(async () => {
    await resetPosDb(db);
  });

  function makeMockPullResponse(
    entity: string,
    items: Record<string, unknown>[],
    hasMore = false,
    nextCursor: string | null = null,
  ): SyncPullResponse {
    const emptyPage = { items: [], nextCursor: null, hasMore: false };
    const entities: SyncPullResponse["entities"] = {
      medicines: emptyPage,
      batches: emptyPage,
      customers: emptyPage,
      doctors: emptyPage,
      schemes: emptyPage,
      storeMedicineSettings: emptyPage,
      storeSettings: emptyPage,
    };

    (entities as Record<string, unknown>)[entity] = {
      items,
      nextCursor,
      hasMore,
    };

    return {
      sessionId: "sess-fixed-1",
      serverTime: "2026-11-03T12:00:00.000Z",
      snapshotTime: "2026-11-03T12:00:00.000Z",
      expiresAt: "2026-11-03T12:15:00.000Z",
      entities,
    };
  }

  it("pulls all entities across pages, stores them in Dexie, and advances durableCheckpoint", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const parsedUrl = new URL(url, "http://localhost");
      const entity = parsedUrl.searchParams.get("entity");
      const cursor = parsedUrl.searchParams.get("cursor");

      if (entity === "medicines") {
        if (!cursor) {
          // Page 1 of medicines
          return {
            ok: true,
            json: async () =>
              makeMockPullResponse(
                "medicines",
                [
                  {
                    id: "m1",
                    tenantId: "tenant-1",
                    name: "Amoxicillin 500",
                    isActive: true,
                    updatedAt: "2026-11-03T11:00:00.000Z",
                  },
                ],
                true,
                "cursor-med-page1",
              ),
          };
        } else {
          // Page 2 of medicines
          return {
            ok: true,
            json: async () =>
              makeMockPullResponse(
                "medicines",
                [
                  {
                    id: "m2",
                    tenantId: "tenant-1",
                    name: "Azithromycin 250",
                    isActive: true,
                    updatedAt: "2026-11-03T11:01:00.000Z",
                  },
                ],
                false,
                null,
              ),
          };
        }
      }

      if (entity === "batches") {
        return {
          ok: true,
          json: async () =>
            makeMockPullResponse(
              "batches",
              [
                {
                  id: "b1",
                  storeId: "store-1",
                  medicineId: "m1",
                  batchNumber: "AMX01",
                  expiryDate: "2027-10-31",
                  mrpPaise: 12000,
                  saleRatePaise: 11000,
                  qtyOnHand: 40,
                  isActive: true,
                  updatedAt: "2026-11-03T11:00:00.000Z",
                },
              ],
              false,
              null,
            ),
        };
      }

      // Other entities return empty page
      return {
        ok: true,
        json: async () => makeMockPullResponse(entity ?? "customers", [], false, null),
      };
    });

    const result = await pullSyncDeltas(db, deviceConfig, mockFetch as unknown as typeof fetch);

    expect(result.success).toBe(true);
    expect(result.completed).toBe(true);
    expect(result.entityCounts.medicines).toBe(2);
    expect(result.entityCounts.batches).toBe(1);

    // Assert items in Dexie
    const meds = await db.medicines.toArray();
    expect(meds).toHaveLength(2);

    const batches = await db.batches.toArray();
    expect(batches).toHaveLength(1);
    expect(batches[0].batchNumber).toBe("AMX01");

    // Checkpoint has advanced in meta
    const checkpoint = await db.getMeta<string>("durableCheckpoint");
    expect(checkpoint).toBe("2026-11-03T12:00:00.000Z");

    // Temporary activePullSession was cleaned up
    const activeSession = await db.getMeta("activePullSession");
    expect(activeSession).toBeNull();
  });

  it("handles tombstones and deactivated records correctly", async () => {
    // Pre-seed an active customer
    await db.customers.put({
      id: "cust-1",
      tenantId: "tenant-1",
      phone: "9876543210",
      name: "Old Customer",
      creditLimitPaise: 500000,
      currentCreditPaise: 0,
      isActive: true,
      updatedAt: "2026-11-01T00:00:00.000Z",
    });

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const parsedUrl = new URL(url, "http://localhost");
      const entity = parsedUrl.searchParams.get("entity");

      if (entity === "customers") {
        return {
          ok: true,
          json: async () =>
            makeMockPullResponse("customers", [
              {
                id: "cust-1",
                tenantId: "tenant-1",
                phone: "9876543210",
                name: "Old Customer",
                creditLimitPaise: 500000,
                currentCreditPaise: 0,
                isActive: false, // Tombstone / deactivated
                updatedAt: "2026-11-03T11:30:00.000Z",
              },
            ]),
        };
      }

      return {
        ok: true,
        json: async () => makeMockPullResponse(entity ?? "medicines", []),
      };
    });

    await pullSyncDeltas(db, deviceConfig, mockFetch as unknown as typeof fetch);

    const cust = await db.customers.get("cust-1");
    expect(cust?.isActive).toBe(false);
  });

  it("does not advance durableCheckpoint when pull fails midway and resumes safely", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const parsedUrl = new URL(url, "http://localhost");
      const entity = parsedUrl.searchParams.get("entity");
      if (entity === "medicines") {
        return {
          ok: true,
          json: async () =>
            makeMockPullResponse("medicines", [
              {
                id: "m-partial",
                tenantId: "tenant-1",
                name: "Partial Med",
                isActive: true,
                updatedAt: "2026-11-03T11:00:00.000Z",
              },
            ]),
        };
      }

      if (entity === "batches") {
        // Simulate network failure on batches
        throw new Error("Connection reset by peer");
      }

      return {
        ok: true,
        json: async () => makeMockPullResponse(entity ?? "customers", []),
      };
    });

    const res1 = await pullSyncDeltas(db, deviceConfig, mockFetch as unknown as typeof fetch);
    expect(res1.success).toBe(false);
    expect(res1.completed).toBe(false);

    // durableCheckpoint must NOT have advanced!
    const checkpoint = await db.getMeta<string>("durableCheckpoint");
    expect(checkpoint).toBeNull();

    // Active session still exists preserving progress
    const session = await db.getMeta<{ completedEntities: string[] }>("activePullSession");
    expect(session?.completedEntities).toContain("medicines");

    // Medicines already committed
    const meds = await db.medicines.toArray();
    expect(meds).toHaveLength(1);

    // Second run with healthy network resumes and skips medicines
    const healthyFetch = vi.fn().mockImplementation(async (url: string) => {
      const parsedUrl = new URL(url, "http://localhost");
      const entity = parsedUrl.searchParams.get("entity");

      return {
        ok: true,
        json: async () => makeMockPullResponse(entity ?? "batches", []),
      };
    });

    const res2 = await pullSyncDeltas(db, deviceConfig, healthyFetch as unknown as typeof fetch);
    expect(res2.success).toBe(true);
    expect(res2.completed).toBe(true);

    // Now durableCheckpoint is updated!
    const finalCheckpoint = await db.getMeta<string>("durableCheckpoint");
    expect(finalCheckpoint).not.toBeNull();
  });
});
