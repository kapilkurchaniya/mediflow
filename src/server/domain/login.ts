import { and, count, desc, eq, gt, inArray, max, ne, sql } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";
import { writeAudit } from "@/server/audit";

/** ROADMAP A1.5: sign-in rules, kept free of Next.js so they can be tested directly against a database. */

export const MAX_FAILED_ATTEMPTS = 10;
export const LOCKOUT_MINUTES = 15;
export const MIN_PASSWORD_LENGTH = 8;

/** Same message for "no such user" and "wrong password", so the form never reveals which emails exist. */
export const GENERIC_LOGIN_ERROR = "Invalid email or password";
export const LOCKED_ERROR = `Too many attempts, try again in ${LOCKOUT_MINUTES} minutes`;

export type LoginResult =
  | { ok: true; userId: string; tenantId: string; storeId: string }
  | { ok: false; error: string };

export interface LoginInput {
  email: string;
  password: string;
  ip?: string | null;
  now?: Date;
}

/** Compares a password with a stored hash (bcrypt). Injected so tests need no Next.js. */
export type VerifyPassword = (password: string, hash: string) => Promise<boolean>;

// A real bcrypt hash of a random string: compared against when the email is unknown, so an unknown email takes
// as long to answer as a wrong password (no timing difference to tell them apart).
const DUMMY_HASH = "$2b$12$pvsoCRuJM/q2UJLLM9MGketxO1x43h8QN3sqLfHERLt4bAtPLlQ4K";

/** Failed attempts for this email in the last 15 minutes, counting only those after the last successful sign-in. */
export async function recentFailures(database: DbOrTx, emailLower: string, now: Date): Promise<number> {
  const windowStart = new Date(now.getTime() - LOCKOUT_MINUTES * 60_000);
  const [last] = await database
    .select({ at: max(schema.loginAttempts.createdAt) })
    .from(schema.loginAttempts)
    .where(and(eq(schema.loginAttempts.emailLower, emailLower), eq(schema.loginAttempts.success, true)));
  const since = last?.at && last.at > windowStart ? last.at : windowStart;
  const [row] = await database
    .select({ n: count() })
    .from(schema.loginAttempts)
    .where(
      and(
        eq(schema.loginAttempts.emailLower, emailLower),
        eq(schema.loginAttempts.success, false),
        gt(schema.loginAttempts.createdAt, since),
      ),
    );
  return Number(row?.n ?? 0);
}

async function record(database: DbOrTx, emailLower: string, ip: string | null | undefined, success: boolean, now: Date) {
  await database.insert(schema.loginAttempts).values({ emailLower, ip: ip ?? null, success, createdAt: now });
}

/**
 * The branch to start in: the one used last time if the member may still use it, otherwise the first allowed one.
 * `null` means the member has no usable store.
 */
export async function chooseStore(
  database: DbOrTx,
  m: { tenantId: string; allStores: boolean; storeIds: string[]; lastStoreId: string | null },
  mayUseAnyStore: boolean,
): Promise<string | null> {
  const all = mayUseAnyStore || m.allStores;
  if (!all && m.storeIds.length === 0) return null;
  const rows = await database
    .select({ id: schema.stores.id })
    .from(schema.stores)
    .where(
      and(
        eq(schema.stores.tenantId, m.tenantId),
        eq(schema.stores.isActive, true),
        all ? undefined : inArray(schema.stores.id, m.storeIds),
      ),
    )
    .orderBy(schema.stores.createdAt);
  const allowed = rows.map((r) => r.id);
  if (m.lastStoreId && allowed.includes(m.lastStoreId)) return m.lastStoreId;
  if (!all) return m.storeIds.find((id) => allowed.includes(id)) ?? null; // the order the administrator listed them in
  return allowed[0] ?? null;
}

/**
 * Checks the credentials, applies the lockout, picks the pharmacy and branch, and records the attempt.
 * Does not create the session: the action does that with the returned ids.
 *
 * - 10 failures for one email in 15 minutes lock it, even for the right password. A successful sign-in clears the count.
 *   Attempts made while locked are refused and not counted (so an attacker cannot keep a real user locked out forever).
 * - A user who belongs to several pharmacies starts in the most recently joined one (a picker is a later feature).
 */
export async function attemptLogin(database: DbOrTx, input: LoginInput, verify: VerifyPassword): Promise<LoginResult> {
  const now = input.now ?? new Date();
  const emailLower = input.email.trim().toLowerCase();
  if (!emailLower || !input.password) return { ok: false, error: "Email and password are required" };

  if ((await recentFailures(database, emailLower, now)) >= MAX_FAILED_ATTEMPTS) {
    return { ok: false, error: LOCKED_ERROR };
  }

  const [user] = await database
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${emailLower}`);
  const passwordOk = await verify(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (user && !user.passwordHash) {
    await record(database, emailLower, input.ip, false, now);
    return { ok: false, error: "This account uses Google Sign-In. Please continue with Google." };
  }
  if (!user || !passwordOk) {
    await record(database, emailLower, input.ip, false, now);
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  // Password is right. Find where this person works.
  const memberships = await database
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id))
    .orderBy(desc(schema.memberships.createdAt));
  const active = memberships.filter((m) => m.status === "active");
  if (memberships.length === 0) {
    await record(database, emailLower, input.ip, false, now);
    return { ok: false, error: "This account is not linked to a pharmacy. Ask your administrator." };
  }
  if (active.length === 0) {
    await record(database, emailLower, input.ip, false, now);
    return { ok: false, error: "Your access has been suspended. Ask your administrator." };
  }
  const m = active[0];

  const [switchAny] = await database
    .select({ n: count() })
    .from(schema.rolePermissions)
    .where(and(eq(schema.rolePermissions.roleId, m.roleId), eq(schema.rolePermissions.permission, "store.switch_any")));
  const storeId = await chooseStore(database, m, Number(switchAny?.n ?? 0) > 0);
  if (!storeId) {
    await record(database, emailLower, input.ip, false, now);
    return { ok: false, error: "Your account has no branch access. Ask your administrator." };
  }

  await record(database, emailLower, input.ip, true, now);
  await database.update(schema.memberships).set({ lastStoreId: storeId }).where(eq(schema.memberships.id, m.id));
  await database.update(schema.users).set({ lastLoginAt: now }).where(eq(schema.users.id, user.id));
  await writeAudit(database, { tenantId: m.tenantId, storeId, userId: user.id }, { action: "login", entityType: "session", entityId: user.id, ip: input.ip ?? undefined });

  return { ok: true, userId: user.id, tenantId: m.tenantId, storeId };
}

export type ChangePasswordResult = { ok: true; signedOutElsewhere: number } | { ok: false; error: string };

/**
 * Sets a new password after checking the current one, then signs the user out everywhere else
 * (every session except `keepSessionId`). Returns how many other sessions were ended.
 */
export async function changePassword(
  database: DbOrTx,
  input: { userId: string; keepSessionId: string; current: string; next: string; confirm: string },
  verify: VerifyPassword,
  hash: (password: string) => Promise<string>,
  audit?: { tenantId: string; storeId: string },
): Promise<ChangePasswordResult> {
  if (!input.current || !input.next) return { ok: false, error: "Fill in all the fields." };
  if (input.next !== input.confirm) return { ok: false, error: "The new passwords do not match." };
  if (input.next.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `The new password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  if (input.next === input.current) return { ok: false, error: "Choose a password you have not used just now." };

  const [user] = await database.select().from(schema.users).where(eq(schema.users.id, input.userId));
  if (!user || !user.passwordHash || !(await verify(input.current, user.passwordHash))) {
    return { ok: false, error: "Your current password is not correct." };
  }

  await database.update(schema.users).set({ passwordHash: await hash(input.next) }).where(eq(schema.users.id, input.userId));
  const ended = await database
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.userId, input.userId), ne(schema.sessions.id, input.keepSessionId)))
    .returning({ id: schema.sessions.id });

  if (audit) {
    await writeAudit(database, { ...audit, userId: input.userId }, { action: "update", entityType: "user", entityId: input.userId, reason: "Password changed" });
  }
  return { ok: true, signedOutElsewhere: ended.length };
}
