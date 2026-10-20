import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { ALL_PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";
import { assertPermission, can, loadAuthCtx } from "@/server/rbac";
import { backfillSystemRoles, seedSystemRoles } from "@/server/roles";
import { ForbiddenError } from "@/server/errors";
import { createTestDb } from "../setup/db";
import { makeStore, makeTenant, makeUser } from "../setup/factories";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

const permsOf = async (roleId: string) =>
  (await t.db.select().from(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId))).map((r) => r.permission).sort();

async function member(roleKey: string, over: Partial<typeof schema.memberships.$inferInsert> = {}) {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id);
  const user = await makeUser(t.db);
  const ids = await seedSystemRoles(t.db, tenant.id);
  await t.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, roleId: ids[roleKey], ...over });
  return { tenant, store, user, ids, session: { tenantId: tenant.id, storeId: store.id } };
}

describe("seedSystemRoles", () => {
  it("creates every system role with exactly its template permissions", async () => {
    const tenant = await makeTenant(t.db);
    const ids = await seedSystemRoles(t.db, tenant.id);
    expect(Object.keys(ids).sort()).toEqual(SYSTEM_ROLES.map((r) => r.key).sort());
    for (const r of SYSTEM_ROLES) expect(await permsOf(ids[r.key])).toEqual([...r.permissions].sort());
    expect(await permsOf(ids.owner)).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("is idempotent: running twice changes nothing and creates no duplicates", async () => {
    const tenant = await makeTenant(t.db);
    const a = await seedSystemRoles(t.db, tenant.id);
    const b = await seedSystemRoles(t.db, tenant.id);
    expect(b).toEqual(a);
    expect(await t.db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenant.id))).toHaveLength(SYSTEM_ROLES.length);
  });

  it("repairs a role that drifted: removes stale permissions and restores missing ones", async () => {
    const tenant = await makeTenant(t.db);
    const ids = await seedSystemRoles(t.db, tenant.id);
    await t.db.insert(schema.rolePermissions).values({ roleId: ids.cashier, permission: "purchase.create" });
    await t.db.delete(schema.rolePermissions).where(and(eq(schema.rolePermissions.roleId, ids.cashier), eq(schema.rolePermissions.permission, "sale.create")));
    await seedSystemRoles(t.db, tenant.id);
    const p = await permsOf(ids.cashier);
    expect(p).toContain("sale.create");
    expect(p).not.toContain("purchase.create");
  });

  it("never touches a custom role", async () => {
    const tenant = await makeTenant(t.db);
    const [custom] = await t.db.insert(schema.roles).values({ tenantId: tenant.id, key: "night_shift", name: "Night shift" }).returning();
    await t.db.insert(schema.rolePermissions).values({ roleId: custom.id, permission: "sale.view" });
    await seedSystemRoles(t.db, tenant.id);
    expect(await permsOf(custom.id)).toEqual(["sale.view"]);
  });
});

describe("backfillSystemRoles (existing tenants, e.g. created before permissions were enforced)", () => {
  it("gives a legacy owner role that had no permissions its full set, and the membership keeps pointing at it", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const user = await makeUser(t.db);
    // how registerAction used to create it: key "owner", NO role_permissions rows, not marked as system
    const [legacy] = await t.db.insert(schema.roles).values({ tenantId: tenant.id, key: "owner", name: "Owner" }).returning();
    await t.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, roleId: legacy.id });
    expect(await permsOf(legacy.id)).toHaveLength(0);

    await backfillSystemRoles(t.db);

    expect(await permsOf(legacy.id)).toEqual([...ALL_PERMISSIONS].sort());
    const ctx = await loadAuthCtx(t.db, { tenantId: tenant.id, storeId: store.id }, { ...user, pharmacistRegNo: null });
    expect(can(ctx, "settings.manage")).toBe(true);
  });
});

describe("loadAuthCtx", () => {
  it("loads the member's permissions and identity", async () => {
    const m = await member("cashier");
    const ctx = await loadAuthCtx(t.db, m.session, { ...m.user, pharmacistRegNo: null });
    expect(ctx).toMatchObject({ tenantId: m.tenant.id, storeId: m.store.id, userId: m.user.id, allowedStoreIds: "all" });
    expect(can(ctx, "sale.create")).toBe(true);
    expect(can(ctx, "purchase.create")).toBe(false);
  });

  it("does not leak the password hash into the context", async () => {
    const m = await member("owner");
    const ctx = await loadAuthCtx(t.db, m.session, { ...m.user, pharmacistRegNo: null });
    expect(JSON.stringify(ctx)).not.toMatch(/passwordHash|password_hash/);
  });

  it("rejects a user with no membership in the tenant (e.g. a session for the wrong tenant)", async () => {
    const m = await member("owner");
    const other = await makeTenant(t.db);
    const otherStore = await makeStore(t.db, other.id);
    await expect(loadAuthCtx(t.db, { tenantId: other.id, storeId: otherStore.id }, { ...m.user, pharmacistRegNo: null })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a suspended member", async () => {
    const m = await member("owner", { status: "suspended" });
    await expect(loadAuthCtx(t.db, m.session, { ...m.user, pharmacistRegNo: null })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("restricts a member to their allowed stores", async () => {
    const m = await member("cashier", { allStores: false, storeIds: [] });
    await expect(loadAuthCtx(t.db, m.session, { ...m.user, pharmacistRegNo: null })).rejects.toBeInstanceOf(ForbiddenError);

    await t.db.update(schema.memberships).set({ storeIds: [m.store.id] }).where(eq(schema.memberships.userId, m.user.id));
    const ctx = await loadAuthCtx(t.db, m.session, { ...m.user, pharmacistRegNo: null });
    expect(ctx.allowedStoreIds).toEqual([m.store.id]);
  });
});

describe("assertPermission", () => {
  it("passes when held and throws a ForbiddenError naming the permission otherwise", () => {
    const ctx = { permissions: new Set(["sale.create"] as const) } as never;
    expect(() => assertPermission(ctx, "sale.create")).not.toThrow();
    expect(() => assertPermission(ctx, "purchase.create")).toThrowError(/purchase\.create/);
  });
});
