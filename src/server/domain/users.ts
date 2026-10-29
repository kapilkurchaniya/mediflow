import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, inArray, isNull, gt } from "drizzle-orm";
import { schema, type Tx, type DbOrTx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { chooseStore, MIN_PASSWORD_LENGTH, type VerifyPassword } from "./login";

/** ROADMAP A1.4: staff accounts, roles, branch access and invitations. Free of Next.js so it can be tested directly. */

export const INVITE_DAYS = 7;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_INVITE = "This invitation link is invalid or has expired. Ask your owner for a new one.";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface AccessInput {
  roleId: string;
  allStores: boolean;
  storeIds: string[];
}

/** Checks the role and branches belong to this pharmacy; returns the values to store. */
async function checkAccess(tx: DbOrTx, tenantId: string, a: AccessInput): Promise<{ roleKey: string; allStores: boolean; storeIds: string[] }> {
  const [role] = await tx
    .select({ key: schema.roles.key })
    .from(schema.roles)
    .where(and(eq(schema.roles.id, a.roleId), eq(schema.roles.tenantId, tenantId)));
  if (!role) throw new DomainError("NOT_FOUND", "Role not found.");

  if (a.allStores) return { roleKey: role.key, allStores: true, storeIds: [] };
  const ids = [...new Set(a.storeIds)];
  if (ids.length === 0) throw new DomainError("INVALID_ACCESS", "Choose at least one branch, or allow all branches.");
  const found = await tx
    .select({ id: schema.stores.id })
    .from(schema.stores)
    .where(and(eq(schema.stores.tenantId, tenantId), inArray(schema.stores.id, ids)));
  if (found.length !== ids.length) throw new DomainError("NOT_FOUND", "Branch not found.");
  return { roleKey: role.key, allStores: false, storeIds: ids };
}

/** Active owners other than `exceptUserId`. Rows are locked so two admins cannot each remove "the other" owner. */
async function otherActiveOwners(tx: Tx, tenantId: string, exceptUserId: string): Promise<number> {
  const rows = await tx
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
    .where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.roles.key, "owner"), eq(schema.memberships.status, "active")))
    .for("update", { of: schema.memberships });
  return rows.filter((r) => r.userId !== exceptUserId).length;
}

// ── Team list ─────────────────────────────────────────────────────────────────────────────────────

export async function listTeam(database: DbOrTx, tenantId: string, now = new Date()) {
  const stores = await database
    .select({ id: schema.stores.id, name: schema.stores.name })
    .from(schema.stores)
    .where(eq(schema.stores.tenantId, tenantId))
    .orderBy(schema.stores.createdAt);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const branches = (all: boolean, ids: string[]) => (all ? "All branches" : ids.map((i) => storeName.get(i) ?? "(removed)").join(", "));

  const members = await database
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      lastLoginAt: schema.users.lastLoginAt,
      roleId: schema.roles.id,
      roleKey: schema.roles.key,
      roleName: schema.roles.name,
      status: schema.memberships.status,
      allStores: schema.memberships.allStores,
      storeIds: schema.memberships.storeIds,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
    .where(eq(schema.memberships.tenantId, tenantId))
    .orderBy(schema.users.name);

  const invites = await database
    .select({
      id: schema.userInvites.id,
      email: schema.userInvites.email,
      roleName: schema.roles.name,
      allStores: schema.userInvites.allStores,
      storeIds: schema.userInvites.storeIds,
      expiresAt: schema.userInvites.expiresAt,
    })
    .from(schema.userInvites)
    .innerJoin(schema.roles, eq(schema.userInvites.roleId, schema.roles.id))
    .where(and(eq(schema.userInvites.tenantId, tenantId), isNull(schema.userInvites.acceptedAt), gt(schema.userInvites.expiresAt, now)))
    .orderBy(desc(schema.userInvites.createdAt));

  const roles = await database
    .select({ id: schema.roles.id, key: schema.roles.key, name: schema.roles.name, description: schema.roles.description })
    .from(schema.roles)
    .where(eq(schema.roles.tenantId, tenantId))
    .orderBy(schema.roles.name);

  return {
    members: members.map((m) => ({ ...m, branches: branches(m.allStores, m.storeIds) })),
    invites: invites.map((i) => ({ ...i, branches: branches(i.allStores, i.storeIds) })),
    roles,
    stores,
  };
}

// ── Invitations ───────────────────────────────────────────────────────────────────────────────────

/**
 * Creates an invitation and returns the RAW token once (the caller builds the link from it). Only its hash is
 * stored. Inviting an email that already has a pending invitation replaces it.
 */
export async function inviteUser(
  tx: Tx,
  ctx: AuthCtx,
  input: AccessInput & { email: string },
  now = new Date(),
): Promise<{ inviteId: string; token: string; expiresAt: Date }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email)) throw new DomainError("INVALID_EMAIL", "Enter a valid email address.");
  const access = await checkAccess(tx, ctx.tenantId, input);

  const [existing] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.memberships, and(eq(schema.memberships.userId, schema.users.id), eq(schema.memberships.tenantId, ctx.tenantId)))
    .where(eq(schema.users.email, email));
  if (existing) throw new DomainError("ALREADY_MEMBER", `${email} is already on your team.`);

  await tx
    .delete(schema.userInvites)
    .where(and(eq(schema.userInvites.tenantId, ctx.tenantId), eq(schema.userInvites.email, email), isNull(schema.userInvites.acceptedAt)));

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * 86_400_000);
  const [invite] = await tx
    .insert(schema.userInvites)
    .values({
      tenantId: ctx.tenantId,
      email,
      roleId: input.roleId,
      allStores: access.allStores,
      storeIds: access.storeIds,
      tokenHash: sha256(token),
      expiresAt,
      createdBy: ctx.userId,
    })
    .returning({ id: schema.userInvites.id });

  await writeAudit(tx, ctx, {
    action: "permission_change",
    entityType: "user_invite",
    entityId: invite.id,
    newValue: { email, role: access.roleKey, allStores: access.allStores, stores: access.storeIds.length },
    reason: "Invitation created",
  });
  return { inviteId: invite.id, token, expiresAt };
}

export async function revokeInvite(tx: Tx, ctx: AuthCtx, inviteId: string): Promise<void> {
  const deleted = await tx
    .delete(schema.userInvites)
    .where(and(eq(schema.userInvites.id, inviteId), eq(schema.userInvites.tenantId, ctx.tenantId), isNull(schema.userInvites.acceptedAt)))
    .returning({ email: schema.userInvites.email });
  if (deleted.length === 0) throw new DomainError("NOT_FOUND", "Invitation not found.");
  await writeAudit(tx, ctx, {
    action: "permission_change",
    entityType: "user_invite",
    entityId: inviteId,
    oldValue: { email: deleted[0].email },
    reason: "Invitation revoked",
  });
}

export type InviteInfo =
  | { valid: true; email: string; pharmacyName: string; roleName: string; existingUser: boolean }
  | { valid: false; error: string };

/** What the invitation page shows before the person fills the form. Reveals nothing for a bad token. */
export async function describeInvite(database: DbOrTx, token: string, now = new Date()): Promise<InviteInfo> {
  const [inv] = await database
    .select({
      email: schema.userInvites.email,
      expiresAt: schema.userInvites.expiresAt,
      acceptedAt: schema.userInvites.acceptedAt,
      roleName: schema.roles.name,
      pharmacyName: schema.tenants.name,
    })
    .from(schema.userInvites)
    .innerJoin(schema.roles, eq(schema.userInvites.roleId, schema.roles.id))
    .innerJoin(schema.tenants, eq(schema.userInvites.tenantId, schema.tenants.id))
    .where(eq(schema.userInvites.tokenHash, sha256(token)));
  if (!inv || inv.acceptedAt || inv.expiresAt <= now) return { valid: false, error: INVALID_INVITE };
  const [user] = await database.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, inv.email));
  return { valid: true, email: inv.email, pharmacyName: inv.pharmacyName, roleName: inv.roleName, existingUser: !!user };
}

/**
 * Accepts an invitation: creates the user (new email) or checks the password (email already has an account), adds the
 * membership with the invited role and branches, and picks the branch to start in. One use only.
 * Throws DomainError (the whole transaction rolls back, so a failed attempt does not burn the invitation).
 */
export async function acceptInvite(
  tx: Tx,
  input: { token: string; name?: string; password: string; ip?: string | null },
  verify: VerifyPassword,
  hash: (password: string) => Promise<string>,
  now = new Date(),
): Promise<{ userId: string; tenantId: string; storeId: string }> {
  const [inv] = await tx
    .select()
    .from(schema.userInvites)
    .where(eq(schema.userInvites.tokenHash, sha256(input.token)))
    .for("update");
  if (!inv || inv.acceptedAt || inv.expiresAt <= now) throw new DomainError("INVALID_INVITE", INVALID_INVITE);

  const [existing] = await tx.select().from(schema.users).where(eq(schema.users.email, inv.email));
  let userId: string;
  if (existing) {
    if (!(await verify(input.password, existing.passwordHash))) {
      throw new DomainError("WRONG_PASSWORD", "That password is not correct for this email.");
    }
    userId = existing.id;
  } else {
    const name = input.name?.trim();
    if (!name) throw new DomainError("INVALID", "Enter your name.");
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new DomainError("WEAK_PASSWORD", `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const [u] = await tx
      .insert(schema.users)
      .values({ name, email: inv.email, passwordHash: await hash(input.password) })
      .returning({ id: schema.users.id });
    userId = u.id;
  }

  const [already] = await tx
    .select({ id: schema.memberships.id })
    .from(schema.memberships)
    .where(and(eq(schema.memberships.tenantId, inv.tenantId), eq(schema.memberships.userId, userId)));
  if (already) throw new DomainError("ALREADY_MEMBER", "You are already on this team. Sign in instead.");

  const [m] = await tx
    .insert(schema.memberships)
    .values({ tenantId: inv.tenantId, userId, roleId: inv.roleId, allStores: inv.allStores, storeIds: inv.storeIds, status: "active" })
    .returning();

  const [switchAny] = await tx
    .select({ n: count() })
    .from(schema.rolePermissions)
    .where(and(eq(schema.rolePermissions.roleId, m.roleId), eq(schema.rolePermissions.permission, "store.switch_any")));
  const storeId = await chooseStore(tx, m, Number(switchAny?.n ?? 0) > 0);
  if (!storeId) throw new DomainError("NO_STORE", "This invitation has no usable branch. Ask your owner to fix your access.");

  await tx.update(schema.userInvites).set({ acceptedAt: now }).where(eq(schema.userInvites.id, inv.id));
  await tx.update(schema.memberships).set({ lastStoreId: storeId }).where(eq(schema.memberships.id, m.id));
  await writeAudit(tx, { tenantId: inv.tenantId, storeId, userId }, {
    action: "permission_change",
    entityType: "membership",
    entityId: m.id,
    newValue: { email: inv.email, allStores: inv.allStores, stores: inv.storeIds.length },
    reason: "Joined through an invitation",
    ip: input.ip ?? undefined,
  });
  return { userId, tenantId: inv.tenantId, storeId };
}

// ── Existing members ──────────────────────────────────────────────────────────────────────────────

async function findMembership(tx: Tx, tenantId: string, userId: string) {
  const [m] = await tx
    .select({ m: schema.memberships, roleKey: schema.roles.key, userName: schema.users.name })
    .from(schema.memberships)
    .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.userId, userId)));
  if (!m) throw new DomainError("NOT_FOUND", "Team member not found.");
  return m;
}

/** Changes someone's role and branch access. The last active owner can't lose the owner role. */
export async function updateMembership(tx: Tx, ctx: AuthCtx, userId: string, input: AccessInput): Promise<void> {
  const cur = await findMembership(tx, ctx.tenantId, userId);
  const access = await checkAccess(tx, ctx.tenantId, input);

  if (cur.roleKey === "owner" && access.roleKey !== "owner" && cur.m.status === "active") {
    if ((await otherActiveOwners(tx, ctx.tenantId, userId)) === 0) {
      throw new DomainError("LAST_OWNER", "There must be at least one owner.");
    }
  }

  await tx
    .update(schema.memberships)
    .set({ roleId: input.roleId, allStores: access.allStores, storeIds: access.storeIds })
    .where(eq(schema.memberships.id, cur.m.id));

  await writeAudit(tx, ctx, {
    action: "permission_change",
    entityType: "membership",
    entityId: cur.m.id,
    oldValue: { person: cur.userName, role: cur.roleKey, allStores: cur.m.allStores, stores: cur.m.storeIds.length },
    newValue: { person: cur.userName, role: access.roleKey, allStores: access.allStores, stores: access.storeIds.length },
    reason: "Role or branch access changed",
  });
}

/** Suspends or re-activates a member. A suspended member is signed out everywhere and refused at sign-in. */
export async function setMemberStatus(tx: Tx, ctx: AuthCtx, userId: string, status: "active" | "suspended"): Promise<void> {
  const cur = await findMembership(tx, ctx.tenantId, userId);
  if (cur.m.status === status) return;

  if (status === "suspended") {
    if (userId === ctx.userId) throw new DomainError("SELF", "You cannot suspend yourself.");
    if (cur.roleKey === "owner" && (await otherActiveOwners(tx, ctx.tenantId, userId)) === 0) {
      throw new DomainError("LAST_OWNER", "There must be at least one owner.");
    }
    await tx.delete(schema.sessions).where(and(eq(schema.sessions.userId, userId), eq(schema.sessions.tenantId, ctx.tenantId)));
  }
  await tx.update(schema.memberships).set({ status }).where(eq(schema.memberships.id, cur.m.id));
  await writeAudit(tx, ctx, {
    action: "permission_change",
    entityType: "membership",
    entityId: cur.m.id,
    oldValue: { person: cur.userName, status: cur.m.status },
    newValue: { person: cur.userName, status },
    reason: status === "suspended" ? "Member suspended" : "Member re-activated",
  });
}
