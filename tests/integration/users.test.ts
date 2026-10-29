import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { SYSTEM_ROLES } from "@/lib/permissions";
import { seedSystemRoles } from "@/server/roles";
import { createTestDb } from "../setup/db";
import { makeStore, makeTenant, makeUser } from "../setup/factories";

const h = vi.hoisted(() => ({
  db: undefined as unknown,
  session: { tenantId: "", storeId: "" },
  user: undefined as unknown,
  created: [] as { userId: string; tenantId: string; storeId: string }[],
}));
vi.mock("@/server/db", async () => ({
  get db() {
    return h.db;
  },
  schema: await import("@/server/db/schema"),
}));
vi.mock("@/server/auth", async () => {
  const bc = (await import("bcryptjs")).default;
  return {
    requireAuth: async () => ({ session: h.session, user: h.user }),
    getCurrentSession: async () => ({ session: h.session, user: h.user }),
    hashPassword: (p: string) => bc.hash(p, 4),
    verifyPassword: (p: string, hash: string) => bc.compare(p, hash),
    generateSessionToken: () => "tok",
    createSession: async (_t: string, userId: string, tenantId: string, storeId: string) => {
      h.created.push({ userId, tenantId, storeId });
    },
    setSessionCookie: async () => {},
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
  forbidden: () => {
    throw new Error("FORBIDDEN");
  },
}));

import { acceptInviteAction, getRolesOverview, getTeam, inviteUserAction, revokeInviteAction, setMemberStatusAction, updateMemberAction } from "@/app/actions/users";
import { attemptLogin } from "@/server/domain/login";
import { acceptInvite, describeInvite, inviteUser, listTeam, revokeInvite, setMemberStatus, updateMembership } from "@/server/domain/users";
import { loadAuthCtx, type AuthCtx } from "@/server/rbac";

const verify = (p: string, hash: string) => bcrypt.compare(p, hash);
const hash = (p: string) => bcrypt.hash(p, 4);
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
afterAll(async () => {
  await t.cleanup();
});

let n = 0;
const uniq = () => `${Date.now().toString(36)}${n++}`;

/** A pharmacy with two stores and an owner, signed in. */
async function scene(roleKey = "owner") {
  const tenant = await makeTenant(t.db, { name: `Pharmacy ${uniq()}` });
  const stores = [await makeStore(t.db, tenant.id, { name: "Store A" }), await makeStore(t.db, tenant.id, { name: "Store B" })];
  const roleIds = await seedSystemRoles(t.db, tenant.id);
  const owner = await makeUser(t.db, { name: "Olivia Owner", email: `owner_${uniq()}@example.test`, passwordHash: await hash("owner-pass-1") });
  await t.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: owner.id, roleId: roleIds[roleKey] });
  h.session = { tenantId: tenant.id, storeId: stores[0].id };
  h.user = owner;
  const ctx = await loadAuthCtx(t.db, h.session, { id: owner.id, name: owner.name, email: owner.email, pharmacistRegNo: null });
  const tx = <T>(fn: (tx: Parameters<Parameters<typeof t.db.transaction>[0]>[0]) => Promise<T>) => t.db.transaction(fn);
  const invite = async (over: Partial<Parameters<typeof inviteUser>[2]> = {}, c: AuthCtx = ctx) =>
    tx((x) => inviteUser(x, c, { email: `new_${uniq()}@example.test`, roleId: roleIds.cashier, allStores: true, storeIds: [], ...over }));
  const join = async (token: string, name = "Nina New", password = "join-pass-1") =>
    tx((x) => acceptInvite(x, { token, name, password }, verify, hash));
  /** Adds a member directly (no invitation). */
  const addMember = async (role: string, over: Partial<typeof schema.memberships.$inferInsert> = {}) => {
    const u = await makeUser(t.db, { name: `Member ${uniq()}`, email: `m_${uniq()}@example.test`, passwordHash: await hash("member-pass-1") });
    await t.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: u.id, roleId: roleIds[role], ...over });
    return u;
  };
  const membership = async (userId: string) =>
    (await t.db.select().from(schema.memberships).where(and(eq(schema.memberships.tenantId, tenant.id), eq(schema.memberships.userId, userId))))[0];
  return { tenant, stores, roleIds, owner, ctx, tx, invite, join, addMember, membership };
}

describe("inviting", () => {
  it("creates a link token, stores only its hash, and expires in 7 days", async () => {
    const s = await scene();
    const now = new Date();
    const r = await s.invite({ email: "Priya@Example.test " });
    expect(r.token).toMatch(/^[0-9a-f]{64}$/);
    const [row] = await t.db.select().from(schema.userInvites).where(eq(schema.userInvites.id, r.inviteId));
    expect(row.tokenHash).toBe(sha256(r.token));
    expect(JSON.stringify(row)).not.toContain(r.token);
    expect(row).toMatchObject({ email: "priya@example.test", tenantId: s.tenant.id, allStores: true, acceptedAt: null });
    expect(Math.round((row.expiresAt.getTime() - now.getTime()) / 86_400_000)).toBe(7);
    const audit = await t.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entityId, r.inviteId));
    expect(audit[0]).toMatchObject({ action: "permission_change", reason: "Invitation created" });
    expect(JSON.stringify(audit[0])).not.toContain(r.token);
  });

  it("inviting the same email again replaces the old link", async () => {
    const s = await scene();
    const a = await s.invite({ email: "same@example.test" });
    const b = await s.invite({ email: "same@example.test" });
    expect((await describeInvite(t.db, a.token)).valid).toBe(false);
    expect((await describeInvite(t.db, b.token)).valid).toBe(true);
    expect((await listTeam(t.db, s.tenant.id)).invites).toHaveLength(1);
  });

  it.each([
    ["a bad email", { email: "not-an-email" }, /valid email/],
    ["a role of another pharmacy", "foreign-role", /Role not found/],
    ["a limited invite with no branch", { allStores: false, storeIds: [] }, /at least one branch/],
    ["a branch of another pharmacy", "foreign-store", /Branch not found/],
  ])("refuses %s", async (_label, patch, message) => {
    const s = await scene();
    const other = await scene();
    let over: Record<string, unknown> = patch as Record<string, unknown>;
    if (patch === "foreign-role") over = { roleId: other.roleIds.owner };
    if (patch === "foreign-store") over = { allStores: false, storeIds: [other.stores[0].id] };
    await expect(s.invite(over)).rejects.toThrow(message);
  });

  it("refuses someone who is already on the team, even if suspended", async () => {
    const s = await scene();
    const m = await s.addMember("cashier", { status: "suspended" });
    await expect(s.invite({ email: m.email })).rejects.toThrow(/already on your team/);
  });

  it("revoking removes the link; another pharmacy's invitation cannot be revoked", async () => {
    const s = await scene();
    const other = await scene();
    const r = await s.invite();
    const theirs = await other.invite();
    await expect(s.tx((x) => revokeInvite(x, s.ctx, theirs.inviteId))).rejects.toThrow(/not found/);
    expect((await describeInvite(t.db, theirs.token)).valid).toBe(true);
    await s.tx((x) => revokeInvite(x, s.ctx, r.inviteId));
    expect((await describeInvite(t.db, r.token)).valid).toBe(false);
  });
});

describe("the invitation page and accepting", () => {
  it("describes a valid invitation and nothing for a bad one", async () => {
    const s = await scene();
    const r = await s.invite({ email: "who@example.test" });
    expect(await describeInvite(t.db, r.token)).toMatchObject({ valid: true, email: "who@example.test", roleName: "Cashier", existingUser: false });
    expect(await describeInvite(t.db, "0".repeat(64))).toMatchObject({ valid: false });
    expect(await describeInvite(t.db, r.token, new Date(Date.now() + 8 * 86_400_000))).toMatchObject({ valid: false }); // expired
  });

  it("a new person joins as a cashier: sees only the cashier's permissions and the allowed branch, then can sign in", async () => {
    const s = await scene();
    const r = await s.invite({ email: "nina@example.test", roleId: s.roleIds.cashier, allStores: false, storeIds: [s.stores[1].id] });
    const res = await s.join(r.token, "Nina New", "join-pass-1");
    expect(res).toMatchObject({ tenantId: s.tenant.id, storeId: s.stores[1].id });

    const [m] = await t.db.select().from(schema.memberships).where(eq(schema.memberships.userId, res.userId));
    expect(m).toMatchObject({ status: "active", allStores: false, storeIds: [s.stores[1].id], lastStoreId: s.stores[1].id });

    const ctx = await loadAuthCtx(t.db, { tenantId: res.tenantId, storeId: res.storeId }, { id: res.userId, name: "Nina New", email: "nina@example.test", pharmacistRegNo: null });
    const cashier = SYSTEM_ROLES.find((x) => x.key === "cashier")!;
    expect([...ctx.permissions].sort()).toEqual([...cashier.permissions].sort());
    expect(ctx.permissions.has("settings.manage")).toBe(false);
    expect(ctx.allowedStoreIds).toEqual([s.stores[1].id]);
    // not allowed to work in Store A
    await expect(loadAuthCtx(t.db, { tenantId: res.tenantId, storeId: s.stores[0].id }, { id: res.userId, name: "x", email: "x", pharmacistRegNo: null })).rejects.toThrow();

    const login = await attemptLogin(t.db, { email: "nina@example.test", password: "join-pass-1" }, verify);
    expect(login).toMatchObject({ ok: true, storeId: s.stores[1].id });
    const audit = await t.db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.entityType, "membership"), eq(schema.auditLogs.entityId, m.id)));
    expect(audit[0]).toMatchObject({ reason: "Joined through an invitation" });
  });

  it("the link works once, and a failed attempt does not burn it", async () => {
    const s = await scene();
    const r = await s.invite({ email: "once@example.test" });
    await expect(s.join(r.token, "Weak", "short")).rejects.toThrow(/at least 8 characters/);
    await expect(s.join(r.token, "  ", "long-enough-1")).rejects.toThrow(/Enter your name/);
    expect(await t.db.select().from(schema.users).where(eq(schema.users.email, "once@example.test"))).toHaveLength(0);
    expect((await describeInvite(t.db, r.token)).valid).toBe(true);

    await s.join(r.token, "Once", "long-enough-1");
    await expect(s.join(r.token, "Twice", "long-enough-1")).rejects.toThrow(/invalid or has expired/);
    expect(await t.db.select().from(schema.users).where(eq(schema.users.email, "once@example.test"))).toHaveLength(1);
  });

  it("an expired or unknown link is refused", async () => {
    const s = await scene();
    const r = await s.invite();
    await t.db.update(schema.userInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.userInvites.id, r.inviteId));
    await expect(s.join(r.token)).rejects.toThrow(/invalid or has expired/);
    await expect(s.join("f".repeat(64))).rejects.toThrow(/invalid or has expired/);
  });

  it("someone who already has an account must prove it with their password", async () => {
    const s = await scene();
    const other = await scene();
    const existing = other.owner; // has an account (in another pharmacy)
    const r = await s.invite({ email: existing.email });
    expect(await describeInvite(t.db, r.token)).toMatchObject({ valid: true, existingUser: true });
    await expect(s.join(r.token, "ignored", "wrong-password")).rejects.toThrow(/not correct for this email/);
    const joined = await s.join(r.token, "ignored", "owner-pass-1");
    expect(joined.userId).toBe(existing.id);
    expect((await t.db.select().from(schema.users).where(eq(schema.users.id, existing.id)))[0].name).toBe("Olivia Owner"); // name untouched
  });

  it("an invitation whose branches are no longer usable is refused", async () => {
    const s = await scene();
    const r = await s.invite({ allStores: false, storeIds: [s.stores[1].id] });
    await t.db.update(schema.stores).set({ isActive: false }).where(eq(schema.stores.id, s.stores[1].id));
    await expect(s.join(r.token)).rejects.toThrow(/no usable branch/);
  });

  it("acceptInviteAction signs the person in (creates a session and redirects)", async () => {
    const s = await scene();
    const r = await s.invite({ email: "action@example.test" });
    h.created.length = 0;
    const form = new FormData();
    form.set("name", "Anil Action");
    form.set("password", "action-pass-1");
    await expect(acceptInviteAction(r.token, null, form)).rejects.toThrow("REDIRECT:/dashboard");
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({ tenantId: s.tenant.id, storeId: s.stores[0].id });
    // a second use shows the error instead of a session
    expect(await acceptInviteAction(r.token, null, form)).toEqual({ error: expect.stringMatching(/invalid or has expired/) });
    expect(h.created).toHaveLength(1);
  });
});

describe("changing and suspending members", () => {
  it("changes a role and branch access (and audits it)", async () => {
    const s = await scene();
    const m = await s.addMember("cashier");
    await s.tx((x) => updateMembership(x, s.ctx, m.id, { roleId: s.roleIds.pharmacist, allStores: false, storeIds: [s.stores[1].id] }));
    expect(await s.membership(m.id)).toMatchObject({ roleId: s.roleIds.pharmacist, allStores: false, storeIds: [s.stores[1].id] });
    const audit = await t.db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.entityType, "membership"), eq(schema.auditLogs.action, "permission_change")));
    expect(audit.some((a) => (a.newValue as { role?: string })?.role === "pharmacist")).toBe(true);
  });

  it("cannot change a member of another pharmacy, or use another pharmacy's role or branch", async () => {
    const s = await scene();
    const other = await scene();
    const theirs = await other.addMember("cashier");
    await expect(s.tx((x) => updateMembership(x, s.ctx, theirs.id, { roleId: s.roleIds.owner, allStores: true, storeIds: [] }))).rejects.toThrow(/not found/);
    expect(await other.membership(theirs.id)).toMatchObject({ roleId: other.roleIds.cashier });
    const mine = await s.addMember("cashier");
    await expect(s.tx((x) => updateMembership(x, s.ctx, mine.id, { roleId: other.roleIds.owner, allStores: true, storeIds: [] }))).rejects.toThrow(/Role not found/);
    await expect(s.tx((x) => setMemberStatus(x, s.ctx, theirs.id, "suspended"))).rejects.toThrow(/not found/);
    expect((await other.membership(theirs.id)).status).toBe("active");
  });

  it("there must always be at least one active owner", async () => {
    const s = await scene();
    await expect(s.tx((x) => updateMembership(x, s.ctx, s.owner.id, { roleId: s.roleIds.manager, allStores: true, storeIds: [] }))).rejects.toThrow("There must be at least one owner.");
    await expect(s.tx((x) => setMemberStatus(x, s.ctx, s.owner.id, "suspended"))).rejects.toThrow(/cannot suspend yourself/);
    expect((await s.membership(s.owner.id)).roleId).toBe(s.roleIds.owner);

    // a second owner makes it possible; an owner who is suspended does not count
    const second = await s.addMember("owner");
    await s.tx((x) => updateMembership(x, s.ctx, s.owner.id, { roleId: s.roleIds.manager, allStores: true, storeIds: [] })); // the first owner steps down
    // now the second is the only owner: they cannot be demoted by a manager-turned-admin either
    const secondCtx = await loadAuthCtx(t.db, h.session, { id: second.id, name: second.name, email: second.email, pharmacistRegNo: null });
    await expect(s.tx((x) => updateMembership(x, secondCtx, second.id, { roleId: s.roleIds.cashier, allStores: true, storeIds: [] }))).rejects.toThrow("There must be at least one owner.");
    const third = await s.addMember("owner", { status: "suspended" });
    await expect(s.tx((x) => setMemberStatus(x, secondCtx, second.id, "suspended"))).rejects.toThrow(/cannot suspend yourself|at least one owner/);
    expect(third.id).toBeTruthy();
  });

  it("suspending signs the member out everywhere and blocks sign-in; re-activating restores it", async () => {
    const s = await scene();
    const m = await s.addMember("cashier");
    await t.db.insert(schema.sessions).values([
      { id: `a-${uniq()}`, userId: m.id, tenantId: s.tenant.id, expiresAt: new Date(Date.now() + 1e8) },
      { id: `b-${uniq()}`, userId: m.id, tenantId: s.tenant.id, expiresAt: new Date(Date.now() + 1e8) },
    ]);
    await s.tx((x) => setMemberStatus(x, s.ctx, m.id, "suspended"));
    expect(await t.db.select().from(schema.sessions).where(eq(schema.sessions.userId, m.id))).toHaveLength(0);
    expect(await attemptLogin(t.db, { email: m.email, password: "member-pass-1" }, verify)).toMatchObject({ ok: false, error: expect.stringMatching(/suspended/) });
    await expect(loadAuthCtx(t.db, h.session, { id: m.id, name: m.name, email: m.email, pharmacistRegNo: null })).rejects.toThrow();

    await s.tx((x) => setMemberStatus(x, s.ctx, m.id, "active"));
    expect(await attemptLogin(t.db, { email: m.email, password: "member-pass-1" }, verify)).toMatchObject({ ok: true });
    await s.tx((x) => setMemberStatus(x, s.ctx, m.id, "active")); // repeating is harmless
  });
});

describe("the team list", () => {
  it("shows members with role and branches, only pending invitations, and only this pharmacy", async () => {
    const s = await scene();
    const other = await scene();
    await other.addMember("cashier");
    await s.addMember("pharmacist", { allStores: false, storeIds: [s.stores[1].id] });
    const live = await s.invite({ email: "live@example.test" });
    const old = await s.invite({ email: "old@example.test" });
    await t.db.update(schema.userInvites).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.userInvites.id, old.inviteId));
    const taken = await s.invite({ email: "taken@example.test" });
    await s.join(taken.token, "Taken Person", "taken-pass-1");

    const team = await listTeam(t.db, s.tenant.id);
    expect(team.members.map((m) => m.roleName).sort()).toEqual(["Cashier", "Owner", "Pharmacist"]);
    expect(team.members.find((m) => m.roleName === "Pharmacist")!.branches).toBe("Store B");
    expect(team.members.find((m) => m.roleName === "Owner")!.branches).toBe("All branches");
    expect(team.invites.map((i) => i.email)).toEqual(["live@example.test"]);
    expect(live.inviteId).toBeTruthy();
    expect(team.stores).toHaveLength(2);
  });
});

describe("the actions and who may use them", () => {
  it("the owner can invite, edit, suspend and revoke through the actions", async () => {
    const s = await scene("owner");
    const inv = await inviteUserAction({ email: "viaaction@example.test", roleId: s.roleIds.cashier, allStores: true, storeIds: [] });
    expect(inv?.data?.token).toMatch(/^[0-9a-f]{64}$/);
    const m = await s.addMember("cashier");
    expect((await updateMemberAction({ userId: m.id, roleId: s.roleIds.manager, allStores: true, storeIds: [] }))?.data).toEqual({ updated: true });
    expect((await setMemberStatusAction({ userId: m.id, status: "suspended" }))?.data).toEqual({ updated: true });
    const team = await getTeam();
    const pending = team.invites.find((i) => i.email === "viaaction@example.test")!;
    expect((await revokeInviteAction({ inviteId: pending.id }))?.data).toEqual({ revoked: true });
    expect((await getRolesOverview()).map((r) => r.key).sort()).toEqual(SYSTEM_ROLES.map((r) => r.key).sort());
  });

  it("shows a domain error as a message, and validates input", async () => {
    const s = await scene("owner");
    const res = await updateMemberAction({ userId: s.owner.id, roleId: s.roleIds.cashier, allStores: true, storeIds: [] });
    expect(res?.serverError).toBe("There must be at least one owner.");
    expect((await inviteUserAction({ email: "", roleId: s.roleIds.cashier, allStores: true, storeIds: [] }))?.validationErrors).toBeTruthy();
  });

  it.each(["manager", "pharmacist", "cashier", "purchase_manager", "accountant", "auditor"])("%s is refused (needs user.manage)", async (role) => {
    const s = await scene(role);
    const other = await s.addMember("cashier");
    const refused = /don't have permission/;
    await expect(getTeam()).rejects.toThrow(refused);
    await expect(getRolesOverview()).rejects.toThrow(refused);
    expect((await inviteUserAction({ email: "x@example.test", roleId: s.roleIds.cashier, allStores: true, storeIds: [] }))?.serverError).toMatch(refused);
    expect((await updateMemberAction({ userId: other.id, roleId: s.roleIds.owner, allStores: true, storeIds: [] }))?.serverError).toMatch(refused);
    expect((await setMemberStatusAction({ userId: other.id, status: "suspended" }))?.serverError).toMatch(refused);
    expect((await membershipOf(s.tenant.id, other.id)).status).toBe("active");
  });
});

async function membershipOf(tenantId: string, userId: string) {
  return (await t.db.select().from(schema.memberships).where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.userId, userId))))[0];
}
