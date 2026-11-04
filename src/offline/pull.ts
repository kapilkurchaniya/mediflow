import type { PosDB } from "./db";
import type {
  OfflineDeviceConfig,
  OfflineMedicine,
  OfflineBatch,
  OfflineCustomer,
  OfflineDoctor,
  OfflineScheme,
  OfflineStoreMedicineSetting,
  OfflineStoreSetting,
} from "./types";
import type { SyncPullResponse } from "@/server/domain/sync/types";

export interface PullResultSummary {
  success: boolean;
  sessionId: string;
  snapshotTime: string;
  entityCounts: Record<string, number>;
  completed: boolean;
  error?: string;
}

interface StoredPullSession {
  sessionId: string;
  snapshotTime: string;
  since?: string;
  cursors: Record<string, string | null>;
  completedEntities: string[];
}

const SYNC_ENTITIES = [
  "medicines",
  "batches",
  "customers",
  "doctors",
  "schemes",
  "storeMedicineSettings",
  "storeSettings",
] as const;

type SyncEntityName = (typeof SYNC_ENTITIES)[number];

/**
 * Paginates through server delta entities, commits them into Dexie inside transactions,
 * and advances the durable checkpoint only when all entity streams report hasMore === false.
 */
export async function pullSyncDeltas(
  db: PosDB,
  config: OfflineDeviceConfig,
  fetchFn: typeof fetch = fetch,
): Promise<PullResultSummary> {
  const durableCheckpoint = (await db.getMeta<string>("durableCheckpoint")) ?? undefined;

  // 1. Recover or initialize pull session
  let session = await db.getMeta<StoredPullSession>("activePullSession");

  if (!session) {
    session = {
      sessionId: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `sess-${Date.now()}`,
      snapshotTime: "",
      since: durableCheckpoint,
      cursors: {},
      completedEntities: [],
    };
    await db.setMeta("activePullSession", session);
  }

  const entityCounts: Record<string, number> = {};

  try {
    for (const entity of SYNC_ENTITIES) {
      if (session.completedEntities.includes(entity)) {
        continue;
      }

      let hasMore = true;
      let cursor = session.cursors[entity] ?? undefined;
      let count = 0;

      while (hasMore) {
        const queryParams = new URLSearchParams();
        if (session.since) queryParams.set("since", session.since);
        if (session.sessionId) queryParams.set("sessionId", session.sessionId);
        if (session.snapshotTime) queryParams.set("snapshotTime", session.snapshotTime);
        queryParams.set("entity", entity);
        if (cursor) queryParams.set("cursor", cursor);
        queryParams.set("limit", "500");

        const res = await fetchFn(`/api/sync/pull?${queryParams.toString()}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${config.deviceToken}`,
          },
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Pull sync HTTP ${res.status}: ${errText}`);
        }

        const data = (await res.json()) as SyncPullResponse;

        // Bind snapshotTime from server
        if (!session.snapshotTime && data.snapshotTime) {
          session.snapshotTime = data.snapshotTime;
          await db.setMeta("activePullSession", session);
        }

        const entityPage = (data.entities as Record<string, { items: Record<string, unknown>[]; nextCursor: string | null; hasMore: boolean }>)[entity];

        if (!entityPage) {
          hasMore = false;
          break;
        }

        const items = entityPage.items;
        count += items.length;

        // Apply page to IndexedDB within an isolated transaction
        await applyEntityPage(db, entity, items);

        hasMore = entityPage.hasMore;
        cursor = entityPage.nextCursor ?? undefined;
        session.cursors[entity] = cursor ?? null;
        await db.setMeta("activePullSession", session);
      }

      entityCounts[entity] = count;
      session.completedEntities.push(entity);
      await db.setMeta("activePullSession", session);
    }

    // 2. All entities completed successfully -> advance durable checkpoint atomically
    const finalSnapshotTime = session.snapshotTime || new Date().toISOString();
    await db.transaction("rw", db.meta, async () => {
      await db.meta.put({ key: "durableCheckpoint", value: finalSnapshotTime });
      await db.meta.put({ key: "lastPullAt", value: new Date().toISOString() });
      await db.meta.delete("activePullSession");
    });

    return {
      success: true,
      sessionId: session.sessionId,
      snapshotTime: finalSnapshotTime,
      entityCounts,
      completed: true,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      sessionId: session.sessionId,
      snapshotTime: session.snapshotTime,
      entityCounts,
      completed: false,
      error: errorMsg,
    };
  }
}

/**
 * Persists an entity page into Dexie with tombstone / soft-deletion handling.
 */
async function applyEntityPage(
  db: PosDB,
  entity: SyncEntityName,
  items: Record<string, unknown>[],
): Promise<void> {
  if (items.length === 0) return;

  switch (entity) {
    case "medicines":
      await db.medicines.bulkPut(items as unknown as OfflineMedicine[]);
      break;
    case "batches": {
      const normalized = items.map((b) => ({
        ...b,
        batchNumber: (b.batchNo as string) || (b.batchNumber as string) || "",
        batchNo: (b.batchNo as string) || (b.batchNumber as string) || "",
        isActive: typeof b.isActive === "boolean" ? b.isActive : b.status === "active",
      }));
      await db.batches.bulkPut(normalized as unknown as OfflineBatch[]);
      break;
    }
    case "customers":
      await db.customers.bulkPut(items as unknown as OfflineCustomer[]);
      break;
    case "doctors":
      await db.doctors.bulkPut(items as unknown as OfflineDoctor[]);
      break;
    case "schemes":
      await db.schemes.bulkPut(items as unknown as OfflineScheme[]);
      break;
    case "storeMedicineSettings":
      await db.storeMedicineSettings.bulkPut(items as unknown as OfflineStoreMedicineSetting[]);
      break;
    case "storeSettings":
      await db.storeSettings.bulkPut(items as unknown as OfflineStoreSetting[]);
      break;
  }
}
