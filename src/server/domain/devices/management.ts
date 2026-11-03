import { and, eq } from "drizzle-orm";
import { writeAudit } from "@/server/audit";
import { schema, type DbOrTx } from "@/server/db";
import { DomainError } from "@/server/errors";
import type { AuthCtx } from "@/server/rbac";
import type { Device } from "@/server/db/schema/devices";
import {
  generateDeviceToken,
  hashDeviceToken,
  validateDeviceCode,
  type RegisterDeviceParams,
  type RevokeDeviceParams,
  type RotateDeviceTokenParams,
} from "./types";

export async function getNextAvailableDeviceCode(
  dbOrTx: DbOrTx,
  tenantId: string,
  storeId: string,
): Promise<string> {
  const existing = await dbOrTx
    .select({ code: schema.devices.code })
    .from(schema.devices)
    .where(
      and(
        eq(schema.devices.tenantId, tenantId),
        eq(schema.devices.storeId, storeId),
      ),
    );

  const used = new Set(existing.map((d) => d.code));

  for (let i = 1; i <= 99; i++) {
    const candidate = i.toString().padStart(2, "0");
    if (!used.has(candidate)) return candidate;
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const letter of letters) {
    for (let d = 0; d <= 9; d++) {
      const candidate = `${letter}${d}`;
      if (!used.has(candidate)) return candidate;
    }
  }

  throw new DomainError(
    "DEVICE_CODES_EXHAUSTED",
    "All device codes for this store have been allocated.",
  );
}

export async function registerDevice(
  tx: DbOrTx,
  ctx: AuthCtx,
  params: RegisterDeviceParams,
): Promise<{ device: Device; rawToken: string }> {
  const store = await tx
    .select()
    .from(schema.stores)
    .where(
      and(
        eq(schema.stores.id, params.storeId),
        eq(schema.stores.tenantId, ctx.tenantId),
      ),
    )
    .limit(1);

  if (!store[0]) {
    throw new DomainError("STORE_NOT_FOUND", "Store not found.");
  }
  if (!store[0].isActive) {
    throw new DomainError(
      "STORE_INACTIVE",
      "Cannot register a device for an inactive store.",
    );
  }

  const code = validateDeviceCode(params.code);

  const existing = await tx
    .select({ id: schema.devices.id })
    .from(schema.devices)
    .where(
      and(
        eq(schema.devices.storeId, params.storeId),
        eq(schema.devices.code, code),
      ),
    )
    .limit(1);

  if (existing[0]) {
    throw new DomainError(
      "DEVICE_CODE_ALREADY_ALLOCATED",
      `Device code "${code}" is already allocated for this store.`,
    );
  }

  const rawToken = generateDeviceToken();
  const tokenHash = hashDeviceToken(rawToken);

  const [device] = await tx
    .insert(schema.devices)
    .values({
      tenantId: ctx.tenantId,
      storeId: params.storeId,
      code,
      name: params.name.trim(),
      platform: params.platform ?? "browser",
      appVersion: params.appVersion ?? null,
      tokenHash,
      createdBy: ctx.userId,
    })
    .returning();

  await writeAudit(tx, ctx, {
    action: "create",
    entityType: "device",
    entityId: device.id,
    newValue: {
      code: device.code,
      name: device.name,
      platform: device.platform,
      storeId: device.storeId,
    },
  });

  return { device, rawToken };
}

export async function rotateDeviceToken(
  tx: DbOrTx,
  ctx: AuthCtx,
  params: RotateDeviceTokenParams,
): Promise<{ device: Device; rawToken: string }> {
  const [device] = await tx
    .select()
    .from(schema.devices)
    .where(
      and(
        eq(schema.devices.id, params.deviceId),
        eq(schema.devices.tenantId, ctx.tenantId),
      ),
    )
    .limit(1)
    .for("update");

  if (!device) {
    throw new DomainError("DEVICE_NOT_FOUND", "Device not found.");
  }
  if (device.revokedAt) {
    throw new DomainError(
      "DEVICE_REVOKED",
      "Cannot rotate token for a revoked device.",
    );
  }

  const rawToken = generateDeviceToken();
  const tokenHash = hashDeviceToken(rawToken);

  const [updated] = await tx
    .update(schema.devices)
    .set({
      tokenHash,
      tokenRotatedAt: new Date(),
    })
    .where(eq(schema.devices.id, device.id))
    .returning();

  await writeAudit(tx, ctx, {
    action: "rotate_token",
    entityType: "device",
    entityId: device.id,
    oldValue: { tokenRotatedAt: device.tokenRotatedAt },
    newValue: { tokenRotatedAt: updated.tokenRotatedAt },
  });

  return { device: updated, rawToken };
}

export async function revokeDevice(
  tx: DbOrTx,
  ctx: AuthCtx,
  params: RevokeDeviceParams,
): Promise<Device> {
  const [device] = await tx
    .select()
    .from(schema.devices)
    .where(
      and(
        eq(schema.devices.id, params.deviceId),
        eq(schema.devices.tenantId, ctx.tenantId),
      ),
    )
    .limit(1)
    .for("update");

  if (!device) {
    throw new DomainError("DEVICE_NOT_FOUND", "Device not found.");
  }
  if (device.revokedAt) {
    return device;
  }

  const [updated] = await tx
    .update(schema.devices)
    .set({
      revokedAt: new Date(),
    })
    .where(eq(schema.devices.id, device.id))
    .returning();

  await writeAudit(tx, ctx, {
    action: "revoke",
    entityType: "device",
    entityId: device.id,
    reason: params.reason,
    newValue: { revokedAt: updated.revokedAt },
  });

  return updated;
}

export async function listDevices(
  dbOrTx: DbOrTx,
  tenantId: string,
  storeId?: string,
): Promise<Device[]> {
  const conditions = [eq(schema.devices.tenantId, tenantId)];
  if (storeId) {
    conditions.push(eq(schema.devices.storeId, storeId));
  }

  return dbOrTx
    .select()
    .from(schema.devices)
    .where(and(...conditions))
    .orderBy(schema.devices.code);
}
