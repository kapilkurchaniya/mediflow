import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { seedSystemRoles } from "@/server/roles";
import {
  attemptLogin,
  changePassword,
  GENERIC_LOGIN_ERROR,
  LOCKED_ERROR,
  MAX_FAILED_ATTEMPTS,
  type LoginResult,
} from "@/server/domain/login";
import { createTestDb } from "../setup/db";
import { makeStore, makeTenant, makeUser } from "../setup/factories";

// bcrypt at a low cost keeps the tests fast; the rules do not depend on the cost.
const verify = (pw: string, hash: string) => bcrypt.compare(pw, hash);
const hash = async (pw: string) => bcrypt.hash(pw, 4);

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

let n = 0;
const uniq = () => `${Date.now().toString(36)}${n++}`;

/** A pharmacy with two stores and one user who is a member with the given role and store access. */
async function scene(opts: { role?: string; allStores?: boolean; storeIndexes?: number[]; status?: string; password?: string } = {}) {
  const tenant = await makeTenant(t.db);
  const stores = [await makeStore(t.db, tenant.id, { name: "Store A" }), await makeStore(t.db, tenant.id, { name: "Store B" })];
  const email = `user_${uniq()}@example.test`;
  const password = opts.password ?? "correct-horse";
  const user = await makeUser(t.db, { email, passwordHash: await hash(password) });
  const roleIds = await seedSystemRoles(t.db, tenant.id);
  const [m] = await t.db
    .insert(schema.memberships)
    .values({
      tenantId: tenant.id,
      userId: user.id,
      roleId: roleIds[opts.role ?? "cashier"],
      allStores: opts.allStores ?? true,
      storeIds: (opts.storeIndexes ?? []).map((i) => stores[i].id),
      status: opts.status ?? "active",
    })
    .returning();
  const login = (pw = password, over: { email?: string; now?: Date; ip?: string } = {}) =>
    attemptLogin(t.db, { email: over.email ?? email, password: pw, now: over.now, ip: over.ip }, verify);
  const attempts = () => t.db.select().from(schema.loginAttempts).where(eq(schema.loginAttempts.emailLower, email.toLowerCase()));
  const membership = async () => (await t.db.select().from(schema.memberships).where(eq(schema.memberships.id, m.id)))[0];
  return { tenant, stores, user, email, password, roleIds, membership: m, login, attempts, reload: membership };
}
const ok = (r: LoginResult) => {
  if (!r.ok) throw new Error(`expected success, got: ${r.error}`);
  return r;
};

describe("sign-in and the 15-minute lockout", () => {
  it("a right password signs in; a wrong one gets the generic message", async () => {
    const s = await scene();
    expect(await s.login("nope")).toEqual({ ok: false, error: GENERIC_LOGIN_ERROR });
    expect(ok(await s.login())).toMatchObject({ userId: s.user.id, tenantId: s.tenant.id });
  });

  it("an unknown email gets exactly the same message as a wrong password", async () => {
    const s = await scene();
    const unknown = await attemptLogin(t.db, { email: `nobody_${uniq()}@example.test`, password: "whatever" }, verify);
    expect(unknown).toEqual(await s.login("nope"));
  });

  it("email is case-insensitive and trimmed", async () => {
    const s = await scene();
    expect(ok(await s.login(s.password, { email: `  ${s.email.toUpperCase()} ` })).userId).toBe(s.user.id);
  });

  it(`${MAX_FAILED_ATTEMPTS} wrong passwords lock the email, even for the right password`, async () => {
    const s = await scene();
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      expect(await s.login(`wrong-${i}`)).toEqual({ ok: false, error: GENERIC_LOGIN_ERROR });
    }
    expect(await s.login()).toEqual({ ok: false, error: LOCKED_ERROR });
    expect(await s.login("wrong again")).toEqual({ ok: false, error: LOCKED_ERROR });
    // each real attempt is a row; refused-while-locked attempts are not counted
    const rows = await s.attempts();
    expect(rows).toHaveLength(MAX_FAILED_ATTEMPTS);
    expect(rows.every((r) => r.success === false)).toBe(true);
  });

  it("nine failures do not lock", async () => {
    const s = await scene();
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) await s.login("wrong");
    expect(ok(await s.login()).userId).toBe(s.user.id);
  });

  it("the lock lifts after 15 minutes", async () => {
    const s = await scene();
    const t0 = new Date();
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await s.login("wrong", { now: t0 });
    expect(await s.login(s.password, { now: new Date(t0.getTime() + 14 * 60_000) })).toEqual({ ok: false, error: LOCKED_ERROR });
    expect(ok(await s.login(s.password, { now: new Date(t0.getTime() + 16 * 60_000) })).userId).toBe(s.user.id);
  });

  it("a successful sign-in clears the failure count", async () => {
    const s = await scene();
    for (let i = 0; i < 9; i++) await s.login("wrong");
    ok(await s.login());
    for (let i = 0; i < 9; i++) await s.login("wrong");
    expect(ok(await s.login()).userId).toBe(s.user.id); // 9 + 9 failures overall, but never 10 in a row
  });

  it("locking one email does not affect another, and unknown emails lock too (no way to tell them apart)", async () => {
    const a = await scene();
    const b = await scene();
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await a.login("wrong");
    expect(await a.login()).toEqual({ ok: false, error: LOCKED_ERROR });
    expect(ok(await b.login()).userId).toBe(b.user.id);

    const ghost = `ghost_${uniq()}@example.test`;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) await attemptLogin(t.db, { email: ghost, password: "x" }, verify);
    expect(await attemptLogin(t.db, { email: ghost, password: "x" }, verify)).toEqual({ ok: false, error: LOCKED_ERROR });
  });

  it("records the ip, marks the user's last login and writes an audit row", async () => {
    const s = await scene();
    await s.login("wrong", { ip: "10.0.0.9" });
    const r = ok(await s.login(s.password, { ip: "10.0.0.9" }));
    const rows = await s.attempts();
    expect(rows.map((x) => [x.success, x.ip])).toEqual([[false, "10.0.0.9"], [true, "10.0.0.9"]]);
    const [u] = await t.db.select().from(schema.users).where(eq(schema.users.id, s.user.id));
    expect(u.lastLoginAt).toBeTruthy();
    const audit = await t.db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.userId, s.user.id), eq(schema.auditLogs.action, "login")));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ tenantId: s.tenant.id, storeId: r.storeId, entityType: "session" });
  });

  it("empty fields are refused without touching the lockout", async () => {
    const s = await scene();
    expect(await attemptLogin(t.db, { email: "", password: "x" }, verify)).toEqual({ ok: false, error: "Email and password are required" });
    expect(await s.attempts()).toHaveLength(0);
  });
});

describe("which pharmacy and branch the session starts in", () => {
  it("a member of all stores starts in the first store, then in the one used last time", async () => {
    const s = await scene({ allStores: true });
    expect(ok(await s.login()).storeId).toBe(s.stores[0].id);
    expect((await s.reload()).lastStoreId).toBe(s.stores[0].id);
    await t.db.update(schema.memberships).set({ lastStoreId: s.stores[1].id }).where(eq(schema.memberships.id, s.membership.id));
    expect(ok(await s.login()).storeId).toBe(s.stores[1].id);
    expect((await s.reload()).lastStoreId).toBe(s.stores[1].id);
  });

  it("falls back to the first store when the last-used store was deactivated", async () => {
    const s = await scene({ allStores: true });
    await t.db.update(schema.memberships).set({ lastStoreId: s.stores[1].id }).where(eq(schema.memberships.id, s.membership.id));
    await t.db.update(schema.stores).set({ isActive: false }).where(eq(schema.stores.id, s.stores[1].id));
    expect(ok(await s.login()).storeId).toBe(s.stores[0].id);
  });

  it("a member limited to store B always starts in B, never in another store", async () => {
    const s = await scene({ allStores: false, storeIndexes: [1] });
    expect(ok(await s.login()).storeId).toBe(s.stores[1].id);
    // a stale "last store" pointing at a store they may no longer use is ignored
    await t.db.update(schema.memberships).set({ lastStoreId: s.stores[0].id }).where(eq(schema.memberships.id, s.membership.id));
    expect(ok(await s.login()).storeId).toBe(s.stores[1].id);
  });

  it("a limited member uses the first of their allowed stores, in the order listed", async () => {
    const s = await scene({ allStores: false, storeIndexes: [1, 0] });
    expect(ok(await s.login()).storeId).toBe(s.stores[1].id);
  });

  it("a role with store.switch_any may use every store even when the membership lists few", async () => {
    const s = await scene({ role: "owner", allStores: false, storeIndexes: [1] });
    await t.db.update(schema.memberships).set({ lastStoreId: s.stores[0].id }).where(eq(schema.memberships.id, s.membership.id));
    expect(ok(await s.login()).storeId).toBe(s.stores[0].id);
  });

  it("no usable store fails cleanly (and the password attempt does not count as a success)", async () => {
    const empty = await scene({ allStores: false, storeIndexes: [] });
    expect(await empty.login()).toEqual({ ok: false, error: "Your account has no branch access. Ask your administrator." });
    const inactive = await scene({ allStores: false, storeIndexes: [0] });
    await t.db.update(schema.stores).set({ isActive: false }).where(eq(schema.stores.id, inactive.stores[0].id));
    expect(await inactive.login()).toMatchObject({ ok: false, error: expect.stringMatching(/no branch access/) });
    expect((await empty.attempts()).every((a) => a.success === false)).toBe(true);
  });

  it("a suspended member and a user with no pharmacy are refused with a clear message", async () => {
    const suspended = await scene({ status: "suspended" });
    expect(await suspended.login()).toEqual({ ok: false, error: "Your access has been suspended. Ask your administrator." });
    const loner = await makeUser(t.db, { email: `loner_${uniq()}@example.test`, passwordHash: await hash("pw-123456") });
    expect(await attemptLogin(t.db, { email: loner.email, password: "pw-123456" }, verify)).toMatchObject({ ok: false, error: expect.stringMatching(/not linked to a pharmacy/) });
  });

  it("a user in two pharmacies starts in the most recently joined one", async () => {
    const first = await scene();
    const other = await makeTenant(t.db);
    const otherStore = await makeStore(t.db, other.id);
    const roleIds = await seedSystemRoles(t.db, other.id);
    await t.db.insert(schema.memberships).values({ tenantId: other.id, userId: first.user.id, roleId: roleIds.owner, createdAt: new Date(Date.now() + 60_000) });
    expect(ok(await first.login())).toMatchObject({ tenantId: other.id, storeId: otherStore.id });
  });
});

describe("changing the password", () => {
  async function withSessions() {
    const s = await scene({ password: "old-password-1" });
    const future = new Date(Date.now() + 86_400_000);
    await t.db.insert(schema.sessions).values([
      { id: `current-${uniq()}`, userId: s.user.id, expiresAt: future },
      { id: `phone-${uniq()}`, userId: s.user.id, expiresAt: future },
      { id: `laptop-${uniq()}`, userId: s.user.id, expiresAt: future },
    ]);
    const sessions = await t.db.select().from(schema.sessions).where(eq(schema.sessions.userId, s.user.id));
    const keep = sessions.find((x) => x.id.startsWith("current-"))!.id;
    const change = (over: Partial<Parameters<typeof changePassword>[1]> = {}) =>
      changePassword(t.db, { userId: s.user.id, keepSessionId: keep, current: "old-password-1", next: "new-password-2", confirm: "new-password-2", ...over }, verify, hash, { tenantId: s.tenant.id, storeId: s.stores[0].id });
    const remaining = async () => (await t.db.select().from(schema.sessions).where(eq(schema.sessions.userId, s.user.id))).map((x) => x.id);
    return { ...s, keep, change, remaining };
  }

  it("changes the password, keeps this session and signs out the others", async () => {
    const s = await withSessions();
    expect(await s.change()).toEqual({ ok: true, signedOutElsewhere: 2 });
    expect(await s.remaining()).toEqual([s.keep]);
    expect(await s.login("old-password-1")).toEqual({ ok: false, error: GENERIC_LOGIN_ERROR });
    expect(ok(await s.login("new-password-2")).userId).toBe(s.user.id);
    const audit = await t.db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.entityId, s.user.id), eq(schema.auditLogs.action, "update")));
    expect(audit[0]).toMatchObject({ entityType: "user", reason: "Password changed" });
    expect(JSON.stringify(audit[0])).not.toContain("new-password-2");
  });

  it.each([
    ["wrong current password", { current: "not-it" }, /current password is not correct/],
    ["new passwords that differ", { confirm: "different-one" }, /do not match/],
    ["a password under 8 characters", { next: "short", confirm: "short" }, /at least 8 characters/],
    ["the same password again", { next: "old-password-1", confirm: "old-password-1" }, /not used just now/],
    ["empty fields", { current: "" }, /Fill in all the fields/],
  ])("refuses %s and changes nothing", async (_label, over, message) => {
    const s = await withSessions();
    const r = await s.change(over);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(message) });
    expect(await s.remaining()).toHaveLength(3);
    expect(ok(await s.login("old-password-1")).userId).toBe(s.user.id);
  });

  it("only touches the user's own sessions", async () => {
    const s = await withSessions();
    const other = await withSessions();
    await s.change();
    expect(await other.remaining()).toHaveLength(3);
  });
});
