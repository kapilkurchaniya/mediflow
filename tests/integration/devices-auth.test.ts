import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { makeStore, makeTenant, makeUser } from "../setup/factories";
import {
  authenticateDevice,
  registerDevice,
  revokeDevice,
  rotateDeviceToken,
} from "@/server/domain/devices";
import { DomainError } from "@/server/errors";
import type { AuthCtx } from "@/server/rbac";

vi.mock("@/server/auth", () => ({
  requireAuth: async () => {
    throw new Error("not used");
  },
  getCurrentSession: async () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.cleanup();
});

describe("Task A4.1: Device Authentication, Rotation & Revocation", () => {
  it("authenticates device via bearer token and throttles last_seen_at updates", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const user = await makeUser(t.db);

    const ctx: AuthCtx = {
      tenantId: tenant.id,
      storeId: store.id,
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        pharmacistRegNo: null,
      },
      permissions: new Set(["settings.manage"]),
      allowedStoreIds: "all",
    };

    const { device, rawToken } = await registerDevice(t.db, ctx, {
      storeId: store.id,
      code: "05",
      name: "Counter 5",
    });

    const authCtx = await authenticateDevice(t.db, `Bearer ${rawToken}`);
    expect(authCtx.deviceId).toBe(device.id);
    expect(authCtx.tenantId).toBe(tenant.id);
    expect(authCtx.storeId).toBe(store.id);
    expect(authCtx.code).toBe("05");

    const [row1] = await t.db
      .select({ lastSeenAt: schema.devices.lastSeenAt })
      .from(schema.devices)
      .where(eq(schema.devices.id, device.id));
    expect(row1.lastSeenAt).not.toBeNull();
    const firstSeen = row1.lastSeenAt?.getTime();

    // Re-authenticate within 5 minutes -> last_seen_at unchanged
    await authenticateDevice(t.db, rawToken);
    const [row2] = await t.db
      .select({ lastSeenAt: schema.devices.lastSeenAt })
      .from(schema.devices)
      .where(eq(schema.devices.id, device.id));
    expect(row2.lastSeenAt?.getTime()).toBe(firstSeen);

    // Invalid token rejected
    await expect(
      authenticateDevice(
        t.db,
        "mf_dev_0000000000000000000000000000000000000000000000000000000000000000",
      ),
    ).rejects.toThrow(DomainError);
  });

  it("rotates device token immediately, invalidating previous credential", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const user = await makeUser(t.db);

    const ctx: AuthCtx = {
      tenantId: tenant.id,
      storeId: store.id,
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        pharmacistRegNo: null,
      },
      permissions: new Set(["settings.manage"]),
      allowedStoreIds: "all",
    };

    const { device, rawToken: token1 } = await registerDevice(t.db, ctx, {
      storeId: store.id,
      code: "10",
      name: "Counter 10",
    });

    await authenticateDevice(t.db, token1);

    const { rawToken: token2 } = await rotateDeviceToken(t.db, ctx, {
      deviceId: device.id,
    });
    expect(token2).not.toBe(token1);

    await expect(authenticateDevice(t.db, token1)).rejects.toThrow(DomainError);

    const authCtx = await authenticateDevice(t.db, token2);
    expect(authCtx.deviceId).toBe(device.id);
    expect(authCtx.code).toBe("10");

    const [rotatedRow] = await t.db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.id, device.id));
    expect(rotatedRow.id).toBe(device.id);
    expect(rotatedRow.code).toBe("10");
    expect(rotatedRow.tokenRotatedAt).not.toBeNull();
  });

  it("revokes device and immediately rejects subsequent authentication", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const user = await makeUser(t.db);

    const ctx: AuthCtx = {
      tenantId: tenant.id,
      storeId: store.id,
      userId: user.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        pharmacistRegNo: null,
      },
      permissions: new Set(["settings.manage"]),
      allowedStoreIds: "all",
    };

    const { device, rawToken } = await registerDevice(t.db, ctx, {
      storeId: store.id,
      code: "99",
      name: "Retiring Terminal",
    });

    await authenticateDevice(t.db, rawToken);

    const revoked = await revokeDevice(t.db, ctx, {
      deviceId: device.id,
      reason: "Terminal replaced by touch kiosk",
    });
    expect(revoked.revokedAt).not.toBeNull();

    const revokedAgain = await revokeDevice(t.db, ctx, {
      deviceId: device.id,
    });
    expect(revokedAgain.id).toBe(device.id);

    await expect(authenticateDevice(t.db, rawToken)).rejects.toThrow(DomainError);

    await expect(
      rotateDeviceToken(t.db, ctx, { deviceId: device.id }),
    ).rejects.toThrow(DomainError);
  });
});
