import type { PosDB } from "./db";
import type { SyncStatusSummary, OfflineDeviceConfig } from "./types";
import { pushOfflineSales, type PushResultSummary } from "./push";
import { pullSyncDeltas, type PullResultSummary } from "./pull";
import { getRemainingInvoiceNumbers, replenishNumberBlock } from "./invoice-series";

export interface SyncCycleResult {
  pushed: PushResultSummary;
  pulled: PullResultSummary;
  replenished?: boolean;
}

let isSyncRunning = false;

/**
 * Runs a full two-way synchronization cycle:
 * 1. Pushes pending local sales to /api/sync/sales
 * 2. Pulls catalog & stock deltas from /api/sync/pull
 * 3. Checks remaining invoice numbers and auto-replenishes if < 50
 *
 * Coordinates multi-tab concurrency using the Web Locks API (navigator.locks).
 */
export async function runSyncCycle(
  db: PosDB,
  config?: OfflineDeviceConfig,
  fetchFn: typeof fetch = fetch,
): Promise<SyncCycleResult | null> {
  const deviceConfig = config ?? (await db.getDeviceConfig());
  if (!deviceConfig) {
    return null;
  }

  // Web Locks coordination
  if (typeof navigator !== "undefined" && navigator.locks) {
    return await navigator.locks.request("mediflow-pos-sync", { ifAvailable: true }, async (lock) => {
      if (!lock) {
        // Another browser tab currently holds the sync worker lock
        return null;
      }
      return await executeSyncCycle(db, deviceConfig, fetchFn);
    });
  }

  // Fallback for non-Web-Locks environments
  if (isSyncRunning) return null;
  try {
    isSyncRunning = true;
    return await executeSyncCycle(db, deviceConfig, fetchFn);
  } finally {
    isSyncRunning = false;
  }
}

async function executeSyncCycle(
  db: PosDB,
  config: OfflineDeviceConfig,
  fetchFn: typeof fetch,
): Promise<SyncCycleResult> {
  // 1. Push pending offline sales first
  const pushRes = await pushOfflineSales(db, config, 50, fetchFn);

  // 2. Pull server deltas
  const pullRes = await pullSyncDeltas(db, config, fetchFn);

  // 3. Auto-replenish invoice numbers if below threshold
  let replenished = false;
  const remainingNumbers = await getRemainingInvoiceNumbers(db, config.storeId, config.deviceId);
  if (remainingNumbers < 50) {
    try {
      await replenishNumberBlock(db, config, 200, fetchFn);
      replenished = true;
    } catch (e) {
      console.warn("[sync] Auto-replenishment deferred:", e);
    }
  }

  // 4. Update sync timestamp in meta
  await db.setMeta("lastSyncAt", new Date().toISOString());

  return {
    pushed: pushRes,
    pulled: pullRes,
    replenished,
  };
}

/**
 * Summarizes the current offline sync state for POS status badges.
 */
export async function getSyncStatusSummary(
  db: PosDB,
  storeId: string,
  deviceId: string,
): Promise<SyncStatusSummary> {
  const isOnline = typeof navigator !== "undefined" && typeof navigator.onLine === "boolean" ? navigator.onLine : true;

  const pendingSales = await db.pendingSales
    .where("[storeId+status]")
    .equals([storeId, "pending"])
    .count();

  const rejectedSales = await db.pendingSales
    .where("[storeId+status]")
    .equals([storeId, "rejected"])
    .count();

  const remaining = await getRemainingInvoiceNumbers(db, storeId, deviceId);
  const lastSync = await db.getMeta<string>("lastSyncAt");

  const lastRejected = await db.pendingSales
    .where("status")
    .equals("rejected")
    .last();

  return {
    online: isOnline,
    isSyncing: isSyncRunning,
    lastSyncAt: lastSync ?? null,
    pendingCount: pendingSales,
    rejectedCount: rejectedSales,
    remainingInvoiceNumbers: remaining,
    lastError: lastRejected?.lastError ?? null,
  };
}

/**
 * Initializes listeners for online events and schedules periodic sync loop.
 */
export function startSyncCoordinator(
  db: PosDB,
  intervalMs = 60_000,
  fetchFn: typeof fetch = fetch,
): { stop: () => void; triggerSync: () => Promise<SyncCycleResult | null> } {
  let timer: NodeJS.Timeout | null = null;

  const triggerSync = async () => {
    return await runSyncCycle(db, undefined, fetchFn);
  };

  const handleOnline = () => {
    void triggerSync();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
    timer = setInterval(() => {
      void triggerSync();
    }, intervalMs);
  }

  return {
    stop: () => {
      if (timer) clearInterval(timer);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
    },
    triggerSync,
  };
}
