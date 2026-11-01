import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb, type TestDb } from "../setup/db";
import { makeStore, makeTenant, makeUser } from "../setup/factories";
import { seedSystemRoles } from "@/server/roles";
import { switchStore, listAllowedStores } from "@/server/domain/stores";
import { openShift, getCurrentShift } from "@/server/domain/cash-sessions";
import { DomainError, ForbiddenError, NotFoundError } from "@/server/errors";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import type { AuthCtx } from "@/server/rbac";
import type { DbOrTx, Tx } from "@/server/db";

describe("Store Switcher & Branch Context (Integration - Task A3.2)", () => {
  let testDb: { db: TestDb; cleanup: () => Promise<void> };
  let db: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterAll(async () => {
    await testDb?.cleanup();
  });

  it("switches store atomically: updates session, membership lastStoreId, and writes audit log", async () => {
    const tenant = await makeTenant(db);
    const store1 = await makeStore(db, tenant.id, { name: "Branch 1", code: "BR01", kind: "retail" });
    const store2 = await makeStore(db, tenant.id, { name: "Central Godown", code: "WH01", kind: "warehouse" });
    const user = await makeUser(db);
    const roleIds = await seedSystemRoles(db, tenant.id);

    const [membership] = await db
      .insert(schema.memberships)
      .values({
        tenantId: tenant.id,
        userId: user.id,
        roleId: roleIds.owner,
        allStores: true,
        lastStoreId: store1.id,
      })
      .returning();

    const sessionId = `sess_${user.id.slice(0, 8)}_1`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: user.id,
      tenantId: tenant.id,
      storeId: store1.id,
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Execute switch from store1 to store2 (warehouse)
    const result = await switchStore(db, {
      sessionId,
      userId: user.id,
      tenantId: tenant.id,
      targetStoreId: store2.id,
      currentStoreId: store1.id,
    });

    expect(result.ok).toBe(true);
    expect(result.storeId).toBe(store2.id);
    expect(result.storeName).toBe("Central Godown");
    expect(result.storeCode).toBe("WH01");
    expect(result.kind).toBe("warehouse");

    // Verify session updated
    const [sess] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
    expect(sess?.storeId).toBe(store2.id);

    // Verify membership lastStoreId updated
    const [mem] = await db.select().from(schema.memberships).where(eq(schema.memberships.id, membership.id));
    expect(mem?.lastStoreId).toBe(store2.id);

    // Verify audit log entry
    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.tenantId, tenant.id),
          eq(schema.auditLogs.entityType, "session"),
          eq(schema.auditLogs.entityId, sessionId),
          eq(schema.auditLogs.action, "store_switch"),
        ),
      );

    expect(audit).toBeDefined();
    expect(audit?.storeId).toBe(store2.id);
    expect(audit?.userId).toBe(user.id);
    expect((audit?.oldValue as Record<string, unknown>)?.storeId).toBe(store1.id);
    expect((audit?.newValue as Record<string, unknown>)?.storeId).toBe(store2.id);
  });

  it("isolates cash register shifts across branches without closing shifts", async () => {
    const tenant = await makeTenant(db);
    const store1 = await makeStore(db, tenant.id, { name: "Branch North", code: "BN01", kind: "retail" });
    const store2 = await makeStore(db, tenant.id, { name: "Branch South", code: "BS01", kind: "retail" });
    const user = await makeUser(db);
    const roleIds = await seedSystemRoles(db, tenant.id);

    await db.insert(schema.memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      roleId: roleIds.pharmacist,
      allStores: true,
      lastStoreId: store1.id,
    });

    const sessionId = `sess_${user.id.slice(0, 8)}_shift`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: user.id,
      tenantId: tenant.id,
      storeId: store1.id,
      expiresAt: new Date(Date.now() + 86400000),
    });

    // 1. Open shift in Store 1
    const ctx1: AuthCtx = {
      tenantId: tenant.id,
      storeId: store1.id,
      userId: user.id,
      user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: null },
      permissions: new Set(ALL_PERMISSIONS),
      allowedStoreIds: "all",
    };

    const shift1 = await openShift(db as unknown as Tx, ctx1, {
      openingCash: 50000,
    });
    expect(shift1.status).toBe("open");

    // Verify active shift exists in Store 1
    const activeInStore1Before = await getCurrentShift(db as unknown as DbOrTx, ctx1);
    expect(activeInStore1Before?.session.id).toBe(shift1.id);

    // 2. Switch user to Store 2
    await switchStore(db, {
      sessionId,
      userId: user.id,
      tenantId: tenant.id,
      targetStoreId: store2.id,
      currentStoreId: store1.id,
    });

    const ctx2: AuthCtx = {
      tenantId: tenant.id,
      storeId: store2.id,
      userId: user.id,
      user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: null },
      permissions: new Set(ALL_PERMISSIONS),
      allowedStoreIds: "all",
    };

    // 3. Verify Store 2 has no active shift
    const activeInStore2 = await getCurrentShift(db as unknown as DbOrTx, ctx2);
    expect(activeInStore2).toBeNull();

    // 4. Verify Store 1's shift remains open and untouched in the database
    const [store1ShiftInDb] = await db
      .select()
      .from(schema.cashSessions)
      .where(eq(schema.cashSessions.id, shift1.id));
    expect(store1ShiftInDb?.status).toBe("open");
    expect(store1ShiftInDb?.closedAt).toBeNull();

    // 5. Switch back to Store 1 and verify the shift is cleanly resumed
    await switchStore(db, {
      sessionId,
      userId: user.id,
      tenantId: tenant.id,
      targetStoreId: store1.id,
      currentStoreId: store2.id,
    });

    const activeInStore1After = await getCurrentShift(db as unknown as DbOrTx, ctx1);
    expect(activeInStore1After?.session.id).toBe(shift1.id);
    expect(activeInStore1After?.session.status).toBe("open");
  });

  it("rejects switching to another tenant's store with NotFoundError", async () => {
    const tenantA = await makeTenant(db);
    const tenantB = await makeTenant(db);
    const storeA = await makeStore(db, tenantA.id, { name: "Tenant A Store", code: "TA01" });
    const storeB = await makeStore(db, tenantB.id, { name: "Tenant B Store", code: "TB01" });
    const userA = await makeUser(db);
    const roleIdsA = await seedSystemRoles(db, tenantA.id);

    await db.insert(schema.memberships).values({
      tenantId: tenantA.id,
      userId: userA.id,
      roleId: roleIdsA.owner,
      allStores: true,
    });

    const sessionId = `sess_${userA.id.slice(0, 8)}_cross`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: userA.id,
      tenantId: tenantA.id,
      storeId: storeA.id,
      expiresAt: new Date(Date.now() + 86400000),
    });

    await expect(
      switchStore(db, {
        sessionId,
        userId: userA.id,
        tenantId: tenantA.id,
        targetStoreId: storeB.id, // Store from Tenant B!
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects unauthorized branch switch for cashiers restricted by storeIds", async () => {
    const tenant = await makeTenant(db);
    const store1 = await makeStore(db, tenant.id, { name: "Store 1", code: "S01" });
    const store2 = await makeStore(db, tenant.id, { name: "Store 2", code: "S02" });
    const user = await makeUser(db);
    const roleIds = await seedSystemRoles(db, tenant.id);

    // Membership restricted specifically to store1
    await db.insert(schema.memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      roleId: roleIds.cashier,
      allStores: false,
      storeIds: [store1.id],
      lastStoreId: store1.id,
    });

    const sessionId = `sess_${user.id.slice(0, 8)}_restricted`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: user.id,
      tenantId: tenant.id,
      storeId: store1.id,
      expiresAt: new Date(Date.now() + 86400000),
    });

    // Attempting to switch to store2 must fail with ForbiddenError
    await expect(
      switchStore(db, {
        sessionId,
        userId: user.id,
        tenantId: tenant.id,
        targetStoreId: store2.id,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("rejects switching to a deactivated store with DomainError (STORE_INACTIVE)", async () => {
    const tenant = await makeTenant(db);
    const store1 = await makeStore(db, tenant.id, { name: "Store Active", code: "SA01", isActive: true });
    const store2 = await makeStore(db, tenant.id, { name: "Store Inactive", code: "SI01", isActive: false });
    const user = await makeUser(db);
    const roleIds = await seedSystemRoles(db, tenant.id);

    await db.insert(schema.memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      roleId: roleIds.owner,
      allStores: true,
      lastStoreId: store1.id,
    });

    const sessionId = `sess_${user.id.slice(0, 8)}_inact`;
    await db.insert(schema.sessions).values({
      id: sessionId,
      userId: user.id,
      tenantId: tenant.id,
      storeId: store1.id,
      expiresAt: new Date(Date.now() + 86400000),
    });

    await expect(
      switchStore(db, {
        sessionId,
        userId: user.id,
        tenantId: tenant.id,
        targetStoreId: store2.id,
      }),
    ).rejects.toThrow(DomainError);
  });

  it("lists allowed stores filtering out inactive stores and respecting storeIds restrictions", async () => {
    const tenant = await makeTenant(db);
    const storeActive1 = await makeStore(db, tenant.id, { name: "A Store", code: "AS01", isActive: true });
    const storeActive2 = await makeStore(db, tenant.id, { name: "B Store", code: "BS01", isActive: true });
    await makeStore(db, tenant.id, { name: "C Inactive Store", code: "CS01", isActive: false });

    const ownerUser = await makeUser(db);
    const cashierUser = await makeUser(db);
    const roleIds = await seedSystemRoles(db, tenant.id);

    // Owner (allStores = true)
    await db.insert(schema.memberships).values({
      tenantId: tenant.id,
      userId: ownerUser.id,
      roleId: roleIds.owner,
      allStores: true,
    });

    // Cashier (only storeActive1)
    await db.insert(schema.memberships).values({
      tenantId: tenant.id,
      userId: cashierUser.id,
      roleId: roleIds.cashier,
      allStores: false,
      storeIds: [storeActive1.id],
    });

    const ownerStores = await listAllowedStores(db, { tenantId: tenant.id, userId: ownerUser.id });
    expect(ownerStores.length).toBe(2);
    expect(ownerStores.map((s) => s.code)).toEqual(["AS01", "BS01"]);

    const cashierStores = await listAllowedStores(db, { tenantId: tenant.id, userId: cashierUser.id });
    expect(cashierStores.length).toBe(1);
    expect(cashierStores[0]?.code).toBe("AS01");
  });
});
