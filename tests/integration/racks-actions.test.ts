import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { seedSystemRoles } from "@/server/roles";
import { actionError } from "@/lib/action-result";
import { createTestDb } from "../setup/db";
import { makeMedicine, makeStore, makeTenant, makeUser } from "../setup/factories";

// Real protectedAction + real RBAC + real actions; only the cookie-based session and cache refresh are faked.
const h = vi.hoisted(() => ({
  db: undefined as unknown,
  session: { tenantId: "", storeId: "" },
  user: undefined as unknown,
}));
vi.mock("@/server/db", async () => ({
  get db() {
    return h.db;
  },
  schema: await import("@/server/db/schema"),
}));
vi.mock("@/server/auth", () => ({ requireAuth: async () => ({ session: h.session, user: h.user }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { assignMedicineToRack, createRack, deleteRack, getRacks, updateRack } from "@/app/actions/racks";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
afterAll(async () => {
  await t.cleanup();
});

/** A pharmacy with one store, and a user with the given system role signed in to it. */
async function pharmacy(roleKey: string) {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id);
  const user = await makeUser(t.db);
  const ids = await seedSystemRoles(t.db, tenant.id);
  await t.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, roleId: ids[roleKey] });
  return { tenant, store, user };
}
const signIn = (p: { tenant: { id: string }; store: { id: string }; user: unknown }) => {
  h.session = { tenantId: p.tenant.id, storeId: p.store.id };
  h.user = p.user;
};
const rackRows = (tenantId: string) => t.db.select().from(schema.racks).where(eq(schema.racks.tenantId, tenantId));

describe("permissions are enforced", () => {
  it("a cashier cannot create a rack: friendly message, nothing written", async () => {
    const p = await pharmacy("cashier");
    signIn(p);
    const res = await createRack({ code: "R1", name: "Front shelf" });
    expect(actionError(res)).toMatch(/don't have permission.*medicine\.manage/);
    expect(await rackRows(p.tenant.id)).toHaveLength(0);
  });

  it("a pharmacist (medicine.manage) can; the rack is stored for the session's own tenant and store", async () => {
    const p = await pharmacy("pharmacist");
    signIn(p);
    const res = await createRack({ code: " r1-s2 ", name: " Front shelf " });
    expect(actionError(res)).toBeNull();
    expect(res?.data?.rack).toMatchObject({ code: "R1-S2", name: "Front shelf", tenantId: p.tenant.id, storeId: p.store.id });
  });

  it("reading racks needs medicine.view (a role without it is refused)", async () => {
    const p = await pharmacy("cashier");
    signIn(p);
    await expect(getRacks()).resolves.toEqual([]); // cashiers have medicine.view
    const noView = await pharmacy("auditor");
    await t.db.delete(schema.rolePermissions).where(and(eq(schema.rolePermissions.permission, "medicine.view")));
    signIn(noView);
    await expect(getRacks()).rejects.toThrow(/medicine\.view/);
  });
});

describe("input validation", () => {
  it("rejects an empty code with the form's own message, before touching the database", async () => {
    const p = await pharmacy("owner");
    signIn(p);
    const res = await createRack({ code: "  ", name: "Shelf" });
    expect(actionError(res)).toBe("Rack code is required (e.g. R1-S2)");
    expect(await rackRows(p.tenant.id)).toHaveLength(0);
  });

  it("reports a duplicate code as a clear message", async () => {
    const p = await pharmacy("owner");
    signIn(p);
    expect(actionError(await createRack({ code: "A1", name: "One" }))).toBeNull();
    expect(actionError(await createRack({ code: "a1", name: "Two" }))).toBe("Rack code 'A1' already exists in this store.");
  });

  it("rejects ids that are not UUIDs", async () => {
    const p = await pharmacy("owner");
    signIn(p);
    expect(actionError(await deleteRack({ id: "not-a-uuid" }))).toBeTruthy();
  });
});

describe("tenant and store isolation", () => {
  it("cannot update or delete another pharmacy's rack", async () => {
    const victim = await pharmacy("owner");
    signIn(victim);
    const rack = (await createRack({ code: "V1", name: "Victim rack" }))!.data!.rack;

    const attacker = await pharmacy("owner");
    signIn(attacker);
    expect(actionError(await updateRack({ id: rack.id, code: "HACK", name: "x" }))).toBe("Rack not found.");
    expect(actionError(await deleteRack({ id: rack.id }))).toBe("Rack not found.");
    expect((await rackRows(victim.tenant.id))[0]).toMatchObject({ code: "V1" });
  });

  it("cannot attach a medicine to another pharmacy's rack (used to be accepted)", async () => {
    const victim = await pharmacy("owner");
    signIn(victim);
    const rack = (await createRack({ code: "V1", name: "Victim rack" }))!.data!.rack;

    const attacker = await pharmacy("owner");
    const med = await makeMedicine(t.db, attacker.tenant.id);
    signIn(attacker);
    expect(actionError(await assignMedicineToRack({ medicineId: med.id, rackId: rack.id }))).toBe("Rack not found.");
    const [after] = await t.db.select().from(schema.storeMedicineSettings).where(and(eq(schema.storeMedicineSettings.medicineId, med.id), eq(schema.storeMedicineSettings.storeId, attacker.store.id)));
    expect(after?.rackId).toBeFalsy();
  });

  it("cannot delete a rack that belongs to a different store of the same pharmacy", async () => {
    const p = await pharmacy("owner");
    const otherStore = await makeStore(t.db, p.tenant.id);
    const [foreign] = await t.db.insert(schema.racks).values({ tenantId: p.tenant.id, storeId: otherStore.id, code: "X1", name: "Other branch" }).returning();
    signIn(p);
    expect(actionError(await deleteRack({ id: foreign.id }))).toBe("Rack not found.");
    expect(await rackRows(p.tenant.id)).toHaveLength(1);
  });

  it("deleting your own rack unlinks its medicines", async () => {
    const p = await pharmacy("owner");
    signIn(p);
    const rack = (await createRack({ code: "M1", name: "Meds" }))!.data!.rack;
    const med = await makeMedicine(t.db, p.tenant.id);
    expect(actionError(await assignMedicineToRack({ medicineId: med.id, rackId: rack.id }))).toBeNull();
    expect(actionError(await deleteRack({ id: rack.id }))).toBeNull();
    const [after] = await t.db.select().from(schema.storeMedicineSettings).where(and(eq(schema.storeMedicineSettings.medicineId, med.id), eq(schema.storeMedicineSettings.storeId, p.store.id)));
    expect(after?.rackId).toBeFalsy();
    expect(await rackRows(p.tenant.id)).toHaveLength(0);
  });
});
