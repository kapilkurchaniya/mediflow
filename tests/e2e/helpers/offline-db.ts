import type { Page } from "@playwright/test";
import crypto from "crypto";
import type { OfflineDeviceConfig, OfflinePendingSale, OfflineProvisionalAllocation } from "../../../src/offline/types";
import type { PosDB } from "../../../src/offline/db";

declare global {
  interface Window {
    __posDb?: PosDB;
  }
}

/**
 * Injects authoritative server-issued device config into browser Dexie instance.
 */
export async function initDexieDevice(page: Page, config: OfflineDeviceConfig): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__posDb), { timeout: 15000 });
  await page.evaluate(async (cfg) => {
    const db = window.__posDb;
    if (!db) {
      throw new Error("[offline-db] window.__posDb not initialized on page.");
    }
    await db.setDeviceConfig(cfg);
  }, config);
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
}

/**
 * Retrieves all pending outbox sales from browser Dexie.
 */
export async function getDexiePendingSales(page: Page): Promise<OfflinePendingSale[]> {
  return await page.evaluate(async () => {
    const db = window.__posDb;
    if (!db) return [];
    return await db.pendingSales.toArray();
  });
}

/**
 * Retrieves all provisional stock allocations from browser Dexie.
 */
export async function getDexieProvisionalAllocations(page: Page): Promise<OfflineProvisionalAllocation[]> {
  return await page.evaluate(async () => {
    const db = window.__posDb;
    if (!db) return [];
    return await db.provisionalAllocations.toArray();
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
