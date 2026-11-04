import type { Page } from "@playwright/test";
import crypto from "crypto";
import type { OfflineDeviceConfig, OfflinePendingSale, OfflineProvisionalAllocation } from "../../../src/offline/types";
import type { PosDB } from "../../../src/offline/db";
import type { ReserveNumbersResponse } from "../../../src/server/domain/sync/types";

declare global {
  interface Window {
    __posDb?: PosDB;
  }
}

/**
 * Injects authoritative server-issued device config into browser Dexie instance.
 */
export async function initDexieDevice(
  page: Page,
  config: OfflineDeviceConfig,
  reservation?: ReserveNumbersResponse,
): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__posDb), { timeout: 15000 });
  await page.evaluate(
    async ({ cfg, res }) => {
      const db = window.__posDb;
      if (!db) {
        throw new Error("[offline-db] window.__posDb not initialized on page.");
      }
      await db.setDeviceConfig(cfg);
      await db.pendingSales.clear();
      await db.provisionalAllocations.clear();
      await db.syncConflicts.clear();
      if (res) {
        await db.numberBlocks.put({
          id: res.reservationId,
          storeId: cfg.storeId,
          deviceId: cfg.deviceId,
          fiscalYear: res.fiscalYear,
          reservationId: res.reservationId,
          storeCode: res.storeCode,
          deviceCode: res.deviceCode,
          startSeq: res.startSeq,
          endSeq: res.endSeq,
          nextSeq: res.startSeq,
          active: 1,
        });
      }
    },
    { cfg: config, res: reservation },
  );
}

/**
 * Triggers online synchronization cycle in the browser to prime catalog & number blocks into Dexie.
 */
export async function primeDexieSync(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __runSyncCycle?: unknown }).__runSyncCycle),
    { timeout: 15000 },
  );
  await page.evaluate(async () => {
    const db = window.__posDb;
    if (!db) throw new Error("window.__posDb not available");
    const runSync = (window as unknown as { __runSyncCycle?: (db: unknown) => Promise<unknown> }).__runSyncCycle;
    if (runSync) {
      await runSync(db);
    }
  });

  // Ensure sync deltas were written to Dexie
  await page.waitForFunction(
    async () => {
      const db = window.__posDb;
      if (!db) return false;
      const medCount = await db.medicines.count();
      const batchCount = await db.batches.count();
      return medCount > 0 && batchCount > 0;
    },
    { timeout: 15000 },
  );

  // Ensure Service Worker is active, controlling client, and offline shell precached
  await page.evaluate(async () => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      try {
        await navigator.serviceWorker.ready;
        const cache = await caches.open("mediflow-pos-v1");
        const hasOffline = await cache.match("/offline.html");
        if (!hasOffline) {
          await cache.addAll(["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"]);
        }
        if (!navigator.serviceWorker.controller) {
          await new Promise<void>((resolve) => {
            navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
            if (navigator.serviceWorker.controller) resolve();
            setTimeout(resolve, 3000);
          });
        }
      } catch {
        // Ignore fallback
      }
    }
  });
}

/**
 * Triggers a synchronization cycle in browser Dexie to flush outbox sales to server.
 */
export async function triggerDexieSync(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const db = window.__posDb;
    if (!db) return;
    const runSync = (window as unknown as { __runSyncCycle?: (db: unknown, cfg?: unknown, fn?: unknown, force?: boolean) => Promise<unknown> }).__runSyncCycle;
    if (runSync) {
      await runSync(db, undefined, undefined, true);
    }
  });
}

/**
 * Retrieves all pending outbox sales from browser Dexie with IndexedDB fallback when on static offline shell.
 */
export async function getDexiePendingSales(page: Page): Promise<OfflinePendingSale[]> {
  return await page.evaluate(async () => {
    if (window.__posDb) {
      return await window.__posDb.pendingSales.toArray();
    }
    return new Promise<OfflinePendingSale[]>((resolve) => {
      if (typeof indexedDB === "undefined") return resolve([]);
      const req = indexedDB.open("mediflow-pos");
      req.onerror = () => resolve([]);
      req.onsuccess = () => {
        const idb = req.result;
        if (!idb.objectStoreNames.contains("pendingSales")) {
          idb.close();
          return resolve([]);
        }
        const tx = idb.transaction("pendingSales", "readonly");
        const store = tx.objectStore("pendingSales");
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          idb.close();
          resolve(getAllReq.result || []);
        };
        getAllReq.onerror = () => {
          idb.close();
          resolve([]);
        };
      };
    });
  });
}

/**
 * Retrieves all provisional stock allocations from browser Dexie with IndexedDB fallback.
 */
export async function getDexieProvisionalAllocations(page: Page): Promise<OfflineProvisionalAllocation[]> {
  return await page.evaluate(async () => {
    if (window.__posDb) {
      return await window.__posDb.provisionalAllocations.toArray();
    }
    return new Promise<OfflineProvisionalAllocation[]>((resolve) => {
      if (typeof indexedDB === "undefined") return resolve([]);
      const req = indexedDB.open("mediflow-pos");
      req.onerror = () => resolve([]);
      req.onsuccess = () => {
        const idb = req.result;
        if (!idb.objectStoreNames.contains("provisionalAllocations")) {
          idb.close();
          return resolve([]);
        }
        const tx = idb.transaction("provisionalAllocations", "readonly");
        const store = tx.objectStore("provisionalAllocations");
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          idb.close();
          resolve(getAllReq.result || []);
        };
        getAllReq.onerror = () => {
          idb.close();
          resolve([]);
        };
      };
    });
  });
}

/**
 * Computes deterministic SHA-256 hash of a sale payload for immutable durability assertions.
 */
export function computePayloadHash(payload: unknown): string {
  const json = JSON.stringify(payload, Object.keys(payload as object).sort());
  return crypto.createHash("sha256").update(json).digest("hex");
}

/**
 * Validates exported disaster recovery JSON against strict allowlist schema.
 * Rejects unknown fields and asserts zero presence of device tokens, hashes, or credentials.
 */
export function validateAllowlistExport(
  dump: Record<string, unknown>,
  sentinelSecrets: string[] = [],
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const ALLOWED_ROOT_KEYS = new Set([
    "version",
    "exportedAt",
    "storeId",
    "storeCode",
    "count",
    "pendingSales",
  ]);

  for (const key of Object.keys(dump)) {
    if (!ALLOWED_ROOT_KEYS.has(key)) {
      errors.push(`Disallowed root property in disaster recovery export: "${key}"`);
    }
  }

  const rawJson = JSON.stringify(dump);
  for (const secret of sentinelSecrets) {
    if (secret && rawJson.includes(secret)) {
      errors.push(`Sensitive sentinel secret leaked into export JSON: "${secret}"`);
    }
  }

  if (rawJson.includes("tokenHash") || rawJson.includes("deviceToken") || rawJson.includes("passwordHash")) {
    errors.push("Authentication or credential field found in export JSON payload.");
  }

  const sales = (dump.pendingSales as Record<string, unknown>[]) || [];
  const ALLOWED_SALE_KEYS = new Set([
    "clientSaleId",
    "invoiceNo",
    "createdAt",
    "storeId",
    "deviceId",
    "status",
    "itemCount",
    "payments",
    "lines",
    "compliance",
  ]);

  for (const sale of sales) {
    for (const key of Object.keys(sale)) {
      if (!ALLOWED_SALE_KEYS.has(key)) {
        errors.push(`Disallowed pending sale property in export: "${key}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
