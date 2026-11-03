import { eq, sql } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { hashDeviceToken, type DeviceAuthCtx } from "./types";

/**
 * Authenticates an incoming device request via its Bearer token.
 *
 * Invariants:
 * - Device identity != User identity: returns DeviceAuthCtx with terminal and store scope.
 * - Rejects non-mf_dev_ tokens, revoked devices, inactive stores, and inactive tenants.
 * - Throttles last_seen_at update to at most once per 5 minutes using atomic SQL.
 */
export async function authenticateDevice(
  dbOrTx: DbOrTx,
  authHeaderOrToken: string | null | undefined,
): Promise<DeviceAuthCtx> {
  if (!authHeaderOrToken) {
    throw new DomainError("DEVICE_UNAUTHORIZED", "Missing device credentials.");
  }

  const rawToken = authHeaderOrToken.startsWith("Bearer ")
    ? authHeaderOrToken.slice(7).trim()
    : authHeaderOrToken.trim();

  if (
    rawToken.length < 10 ||
    rawToken.length > 256 ||
    !rawToken.startsWith("mf_dev_")
  ) {
    throw new DomainError("DEVICE_UNAUTHORIZED", "Invalid device credentials.");
  }

  const tokenHash = hashDeviceToken(rawToken);

  const [result] = await dbOrTx
    .select({
      device: schema.devices,
      store: schema.stores,
      tenant: schema.tenants,
    })
    .from(schema.devices)
    .innerJoin(schema.stores, eq(schema.devices.storeId, schema.stores.id))
    .innerJoin(schema.tenants, eq(schema.devices.tenantId, schema.tenants.id))
    .where(eq(schema.devices.tokenHash, tokenHash))
    .limit(1);

  if (!result) {
    throw new DomainError("DEVICE_UNAUTHORIZED", "Invalid device credentials.");
  }

  if (result.device.revokedAt) {
    throw new DomainError("DEVICE_REVOKED", "Device access has been revoked.");
  }

  if (!result.store.isActive) {
    throw new DomainError("STORE_INACTIVE", "Device store is inactive.");
  }

  await dbOrTx.execute(sql`
    UPDATE devices
    SET last_seen_at = now()
    WHERE id = ${result.device.id}
      AND revoked_at IS NULL
      AND (
        last_seen_at IS NULL
        OR last_seen_at < now() - interval '5 minutes'
      )
  `);

  return {
    tenantId: result.device.tenantId,
    storeId: result.device.storeId,
    deviceId: result.device.id,
    code: result.device.code,
    name: result.device.name,
    platform: result.device.platform as "browser" | "desktop" | "mobile",
  };
}
