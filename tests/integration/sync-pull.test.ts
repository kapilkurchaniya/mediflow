import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { makeBatch, makeCustomer, makeMedicine, makeStore, makeTenant, makeUser } from "../setup/factories";
import { registerDevice } from "@/server/domain/devices";
import { pullSyncDeltas } from "@/server/domain/sync/pull";
import { authenticateDevice } from "@/server/domain/devices/auth";
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

describe("Task A4.3: Delta Pull Engine", () => {
  async function setupWorld() {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const otherStore = await makeStore(t.db, tenant.id);
    const user = await makeUser(t.db);

    const ctx: AuthCtx = {
      tenantId: tenant.id,
      storeId: store.id,
      userId: user.id,
      user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: null },
      permissions: new Set(["settings.manage"]),
      allowedStoreIds: "all",
    };

    const reg = await registerDevice(t.db, ctx, {
      code: "01",
      name: "Counter 1",
      platform: "browser",
      storeId: store.id,
    });

    const deviceCtx = await authenticateDevice(t.db, `Bearer ${reg.rawToken}`);

    return { tenant, store, otherStore, user, reg, deviceCtx };
  }

  it("authenticates device via Bearer token and updates last_sync_at", async () => {
    const { deviceCtx, reg } = await setupWorld();

    const pullRes = await pullSyncDeltas(t.db, deviceCtx, { limit: 10 });
    expect(pullRes.sessionId).toBeDefined();
    expect(pullRes.serverTime).toBeDefined();
    expect(pullRes.entities).toBeDefined();

    const [device] = await t.db
      .select({ lastSyncAt: schema.devices.lastSyncAt })
      .from(schema.devices)
      .where(eq(schema.devices.id, deviceCtx.deviceId));

    expect(device?.lastSyncAt).not.toBeNull();

    // Verify invalid token rejection
    await expect(authenticateDevice(t.db, "Bearer invalid-token")).rejects.toThrow(
      "Invalid device credentials",
    );

    // Verify revoked device rejection
    await t.db
      .update(schema.devices)
      .set({ revokedAt: new Date() })
      .where(eq(schema.devices.id, deviceCtx.deviceId));

    await expect(authenticateDevice(t.db, `Bearer ${reg.rawToken}`)).rejects.toThrow(
      "Device access has been revoked",
    );
  });

  it("respects fixed upper bound (snapshotTime) across pull session", async () => {
    const { tenant, deviceCtx } = await setupWorld();

    const med1 = await makeMedicine(t.db, tenant.id, { name: "Med Before Snapshot" });

    const snapshotTime = new Date().toISOString();
    // Short wait to ensure timestamp advances
    await new Promise((res) => setTimeout(res, 50));

    const med2 = await makeMedicine(t.db, tenant.id, { name: "Med After Snapshot" });

    const pullRes = await pullSyncDeltas(t.db, deviceCtx, {
      snapshotTime,
      entity: "medicines",
    });

    const ids = pullRes.entities.medicines.items.map((i) => i.id);
    expect(ids).toContain(med1.id);
    expect(ids).not.toContain(med2.id);
  });

  it("paginates entity pages with deterministic cursor and hasMore", async () => {
    const { tenant, deviceCtx } = await setupWorld();

    const medA = await makeMedicine(t.db, tenant.id, { name: "Med A" });
    const medB = await makeMedicine(t.db, tenant.id, { name: "Med B" });
    const medC = await makeMedicine(t.db, tenant.id, { name: "Med C" });
    const medD = await makeMedicine(t.db, tenant.id, { name: "Med D" });

    // Page 1 with limit = 2
    const page1 = await pullSyncDeltas(t.db, deviceCtx, {
      entity: "medicines",
      limit: 2,
    });

    expect(page1.entities.medicines.items.length).toBe(2);
    expect(page1.entities.medicines.hasMore).toBe(true);
    expect(page1.entities.medicines.nextCursor).not.toBeNull();

    // Page 2 using cursor
    const page2 = await pullSyncDeltas(t.db, deviceCtx, {
      entity: "medicines",
      cursor: page1.entities.medicines.nextCursor!,
      limit: 2,
    });

    expect(page2.entities.medicines.items.length).toBeGreaterThanOrEqual(1);

    const allPulledIds = [
      ...page1.entities.medicines.items.map((i) => i.id),
      ...page2.entities.medicines.items.map((i) => i.id),
    ];
    expect(allPulledIds).toContain(medA.id);
    expect(allPulledIds).toContain(medB.id);
    expect(allPulledIds).toContain(medC.id);
    expect(allPulledIds).toContain(medD.id);
    expect(allPulledIds).toContain(medC.id);
  });

  it("delivers tombstoned (inactive) records and zero-stock batches for local state updates", async () => {
    const { tenant, store, deviceCtx } = await setupWorld();

    // Inactive medicine
    const med = await makeMedicine(t.db, tenant.id, { isActive: false, name: "Deactivated Drug" });
    // Inactive customer
    const cust = await makeCustomer(t.db, tenant.id, { isActive: false, name: "Former Client" });
    // Zero-stock batch
    const batch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      medicineId: med.id,
      qtyOnHand: 0,
      batchNo: "ZERO-001",
    });

    const pullRes = await pullSyncDeltas(t.db, deviceCtx, {});

    const medItem = pullRes.entities.medicines.items.find((i) => i.id === med.id);
    expect(medItem).toBeDefined();
    expect(medItem?.isActive).toBe(false);

    const custItem = pullRes.entities.customers.items.find((i) => i.id === cust.id);
    expect(custItem).toBeDefined();
    expect(custItem?.isActive).toBe(false);

    const batchItem = pullRes.entities.batches.items.find((i) => i.id === batch.id);
    expect(batchItem).toBeDefined();
    expect(batchItem?.qtyOnHand).toBe(0);
  });

  it("applies 30-second overlap buffer to safely capture recently modified records", async () => {
    const { tenant, deviceCtx } = await setupWorld();

    const med = await makeMedicine(t.db, tenant.id, { name: "Overlap Med" });

    // Client checkpoint set to 15 seconds AFTER the record was created
    const sinceTime = new Date(Date.now() + 15 * 1000).toISOString();

    // With 30s buffer, effectiveSince is `sinceTime - 30s` (which is 15s in the past)
    const pullRes = await pullSyncDeltas(t.db, deviceCtx, {
      since: sinceTime,
      entity: "medicines",
    });

    const ids = pullRes.entities.medicines.items.map((i) => i.id);
    expect(ids).toContain(med.id);
  });

  it("scopes schemes to current store and tenant-wide, excluding foreign store schemes", async () => {
    const { tenant, store, otherStore, deviceCtx } = await setupWorld();

    // 1. Tenant-wide scheme (storeId is null)
    const [globalScheme] = await t.db
      .insert(schema.schemes)
      .values({
        tenantId: tenant.id,
        storeId: null,
        name: "Tenant-wide 10% Off",
        discountBp: 1000,
        schemeType: "flat",
      })
      .returning();

    // 2. Store-specific scheme
    const [storeScheme] = await t.db
      .insert(schema.schemes)
      .values({
        tenantId: tenant.id,
        storeId: store.id,
        name: "Store Promo",
        discountBp: 500,
        schemeType: "flat",
      })
      .returning();

    // 3. Other store scheme
    const [otherScheme] = await t.db
      .insert(schema.schemes)
      .values({
        tenantId: tenant.id,
        storeId: otherStore.id,
        name: "Other Store Promo",
        discountBp: 2000,
        schemeType: "flat",
      })
      .returning();

    const pullRes = await pullSyncDeltas(t.db, deviceCtx, { entity: "schemes" });
    const schemeIds = pullRes.entities.schemes.items.map((i) => i.id);

    expect(schemeIds).toContain(globalScheme.id);
    expect(schemeIds).toContain(storeScheme.id);
    expect(schemeIds).not.toContain(otherScheme.id);
  });
});
