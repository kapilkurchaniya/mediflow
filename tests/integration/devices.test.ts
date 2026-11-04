import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { makeStore, makeTenant, makeUser } from "../setup/factories";
import {
  getNextAvailableDeviceCode,
  hashDeviceToken,
  listDevices,
  registerDevice,
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

describe("Task A4.1: Devices Registration & Code Allocation", () => {
  it("registers a new device, stores only its SHA-256 hash, and writes audit log", async () => {
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

    const nextCode = await getNextAvailableDeviceCode(t.db, tenant.id, store.id);
    expect(nextCode).toBe("01");

    const { device, rawToken } = await registerDevice(t.db, ctx, {
      storeId: store.id,
      code: nextCode,
      name: "Counter 1 - Front Checkout",
      platform: "desktop",
      appVersion: "1.2.0",
    });

    expect(device.code).toBe("01");
    expect(device.name).toBe("Counter 1 - Front Checkout");
    expect(device.platform).toBe("desktop");
    expect(device.appVersion).toBe("1.2.0");
    expect(rawToken.startsWith("mf_dev_")).toBe(true);

    const [dbRow] = await t.db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.id, device.id));

    expect(dbRow.tokenHash).toBe(hashDeviceToken(rawToken));
    expect(dbRow.tokenHash).not.toBe(rawToken);

    const [audit] = await t.db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, device.id));

    expect(audit).toBeDefined();
    expect(audit.action).toBe("create");
    expect(audit.entityType).toBe("device");

    const afterCode = await getNextAvailableDeviceCode(t.db, tenant.id, store.id);
    expect(afterCode).toBe("02");
  });

  it("enforces unique device code within a store but permits same code in different stores", async () => {
    const tenant = await makeTenant(t.db);
    const storeA = await makeStore(t.db, tenant.id, { code: "ST01" });
    const storeB = await makeStore(t.db, tenant.id, { code: "ST02" });
    const user = await makeUser(t.db);

    const ctx: AuthCtx = {
      tenantId: tenant.id,
      storeId: storeA.id,
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

    await registerDevice(t.db, ctx, {
      storeId: storeA.id,
      code: "01",
      name: "Store A Counter 1",
    });

    await expect(
      registerDevice(t.db, ctx, {
        storeId: storeA.id,
        code: "01",
        name: "Store A Duplicate Counter",
      }),
    ).rejects.toThrow(DomainError);

    const { device: devB } = await registerDevice(t.db, ctx, {
      storeId: storeB.id,
      code: "01",
      name: "Store B Counter 1",
    });
    expect(devB.code).toBe("01");
    expect(devB.storeId).toBe(storeB.id);
  });

  it("lists devices scoped to tenant and optional store", async () => {
    const tenant = await makeTenant(t.db);
    const store1 = await makeStore(t.db, tenant.id);
    const store2 = await makeStore(t.db, tenant.id);
    const user = await makeUser(t.db);

    const ctx: AuthCtx = {
      tenantId: tenant.id,
      storeId: store1.id,
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

    await registerDevice(t.db, ctx, {
      storeId: store1.id,
      code: "A1",
      name: "Store 1 Dev A1",
    });
    await registerDevice(t.db, ctx, {
      storeId: store2.id,
      code: "B1",
      name: "Store 2 Dev B1",
    });

    const all = await listDevices(t.db, tenant.id);
    expect(all.length).toBe(2);

    const store1Only = await listDevices(t.db, tenant.id, store1.id);
    expect(store1Only.length).toBe(1);
    expect(store1Only[0].code).toBe("A1");
  });
});
