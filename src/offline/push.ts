import type { PosDB } from "./db";
import type { OfflineDeviceConfig } from "./types";
import type { IngestOfflineSalesResponse } from "@/server/domain/sync/types";

export interface PushResultSummary {
  pushed: number;
  created: number;
  duplicates: number;
  rejected: number;
  errors?: string[];
}

/**
 * Sweeps sales stuck in 'syncing' for more than 60 seconds (due to browser crashes / aborted requests)
 * and resets them to 'pending' so they can be re-attempted.
 */
export async function recoverStaleSyncingSales(db: PosDB, staleThresholdMs = 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - staleThresholdMs).toISOString();

  const syncingSales = await db.pendingSales
    .where("status")
    .equals("syncing")
    .toArray();

  const stale = syncingSales.filter((s) => s.updatedAt < cutoff);
  if (stale.length === 0) return 0;

  const now = new Date().toISOString();
  await db.transaction("rw", db.pendingSales, async () => {
    for (const sale of stale) {
      sale.status = "pending";
      sale.retryCount += 1;
      sale.updatedAt = now;
      await db.pendingSales.put(sale);
    }
  });

  return stale.length;
}

/**
 * Pushes queued offline sales to POST /api/sync/sales in batches of up to 50.
 * Reconciles provisional stock on successful commits and records sync conflicts on rejections.
 */
export async function pushOfflineSales(
  db: PosDB,
  config: OfflineDeviceConfig,
  batchSize = 50,
  fetchFn: typeof fetch = fetch,
): Promise<PushResultSummary> {
  // 1. Recover any sales stuck from previous interruptions
  await recoverStaleSyncingSales(db);

  const now = new Date().toISOString();

  // 2. Select pending sales whose nextRetryAt has arrived
  const allPending = await db.pendingSales
    .where("[storeId+status]")
    .equals([config.storeId, "pending"])
    .toArray();

  const eligible = allPending
    .filter((s) => s.nextRetryAt <= now)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, batchSize);

  if (eligible.length === 0) {
    return { pushed: 0, created: 0, duplicates: 0, rejected: 0 };
  }

  // 3. Mark selected sales as syncing
  await db.transaction("rw", db.pendingSales, async () => {
    for (const s of eligible) {
      s.status = "syncing";
      s.updatedAt = now;
      await db.pendingSales.put(s);
    }
  });

  try {
    const res = await fetchFn("/api/sync/sales", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.deviceToken}`,
      },
      body: JSON.stringify({
        sales: eligible.map((s) => s.payload),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Sync sales push HTTP ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as IngestOfflineSalesResponse;

    let createdCount = 0;
    let duplicateCount = 0;
    let rejectedCount = 0;

    await db.transaction(
      "rw",
      [db.pendingSales, db.provisionalAllocations, db.syncConflicts],
      async () => {
        for (const item of data.results) {
          const sale = eligible.find((s) => s.clientSaleId === item.clientSaleId);
          if (!sale) continue;

          if (item.status === "created" || item.status === "duplicate") {
            if (item.status === "created") createdCount++;
            else duplicateCount++;

            sale.status = "synced";
            sale.serverSaleId = item.saleId;
            sale.updatedAt = new Date().toISOString();
            await db.pendingSales.put(sale);

            // Reconcile provisional stock allocation
            await db.provisionalAllocations
              .where("clientSaleId")
              .equals(item.clientSaleId)
              .delete();
          } else if (item.status === "rejected") {
            rejectedCount++;
            sale.status = "rejected";
            sale.lastError = item.error;
            sale.errorRetryable = false;
            sale.updatedAt = new Date().toISOString();
            await db.pendingSales.put(sale);

            await db.syncConflicts.put({
              id: `conflict-${item.clientSaleId}`,
              storeId: config.storeId,
              deviceId: config.deviceId,
              clientSaleId: item.clientSaleId,
              conflictType: "rejected_sale",
              message: item.error,
              createdAt: new Date().toISOString(),
            });
          }
        }
      },
    );

    return {
      pushed: eligible.length,
      created: createdCount,
      duplicates: duplicateCount,
      rejected: rejectedCount,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Network / server failure: revert syncing sales to pending with exponential backoff
    const backoffNow = new Date().toISOString();
    await db.transaction("rw", db.pendingSales, async () => {
      for (const s of eligible) {
        s.status = "pending";
        s.retryCount += 1;
        s.lastError = errMsg;
        s.updatedAt = backoffNow;

        // Exponential backoff capped at 5 minutes + jitter
        const delayMs = Math.min(300_000, Math.pow(2, s.retryCount) * 5_000 + Math.random() * 1_000);
        s.nextRetryAt = new Date(Date.now() + delayMs).toISOString();
        await db.pendingSales.put(s);
      }
    });

    return {
      pushed: eligible.length,
      created: 0,
      duplicates: 0,
      rejected: 0,
      errors: [errMsg],
    };
  }
}
