import crypto from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
import { schema, type DbOrTx, type Tx } from "@/server/db";
import { writeAudit } from "@/server/audit";
import { DomainError } from "@/server/errors";
import { seedSystemRoles } from "@/server/roles";
import type { GoogleProfile } from "@/server/oauth/google";
import { chooseStore } from "./login";

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export type GoogleAuthResolution =
  | { ok: true; status: "authenticated"; userId: string; tenantId: string; storeId: string | null; email: string }
  | { ok: true; status: "needs_signup"; profile: GoogleProfile }
  | { ok: false; error: string };

/**
 * Resolves a verified Google profile to a MediFlow user + tenant + active store.
 * - If already linked in `user_oauth_accounts`, logs them in.
 * - If an existing `users` row matches the verified email (case-insensitive), auto-links and logs them in.
 * - Otherwise returns `needs_signup` so the user can enter their Pharmacy Name.
 */
export async function resolveGoogleAuth(
  database: DbOrTx,
  profile: GoogleProfile,
  ip: string | null = null,
  now = new Date(),
): Promise<GoogleAuthResolution> {
  if (!profile.emailVerified) {
    return { ok: false, error: "Your Google email address must be verified before signing in." };
  }
  const emailLower = profile.email.trim().toLowerCase();

  const [linked] = await database
    .select({ user: schema.users })
    .from(schema.userOauthAccounts)
    .innerJoin(schema.users, eq(schema.userOauthAccounts.userId, schema.users.id))
    .where(
      and(
        eq(schema.userOauthAccounts.provider, "google"),
        eq(schema.userOauthAccounts.providerAccountId, profile.sub),
      ),
    );

  let user = linked?.user ?? null;

  if (!user) {
    const [byEmail] = await database
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${emailLower}`);

    if (!byEmail) {
      return { ok: true, status: "needs_signup", profile };
    }
    user = byEmail;

    // Auto-link verified Google identity to the matching MediFlow user
    await database
      .insert(schema.userOauthAccounts)
      .values({
        userId: user.id,
        provider: "google",
        providerAccountId: profile.sub,
        email: emailLower,
        emailVerified: "true",
        avatarUrl: profile.picture,
      })
      .onConflictDoUpdate({
        target: [schema.userOauthAccounts.userId, schema.userOauthAccounts.provider],
        set: {
          providerAccountId: profile.sub,
          email: emailLower,
          emailVerified: "true",
          avatarUrl: profile.picture,
          updatedAt: now,
        },
      });
  }

  const memberships = await database
    .select({
      tenantId: schema.memberships.tenantId,
      roleId: schema.memberships.roleId,
      status: schema.memberships.status,
      allStores: schema.memberships.allStores,
      storeIds: schema.memberships.storeIds,
      lastStoreId: schema.memberships.lastStoreId,
    })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id));

  const active = memberships.find((m) => m.status === "active");
  if (!active) {
    return { ok: false, error: "Your account does not have an active pharmacy membership." };
  }

  const [switchAny] = await database
    .select({ n: count() })
    .from(schema.rolePermissions)
    .where(and(eq(schema.rolePermissions.roleId, active.roleId), eq(schema.rolePermissions.permission, "store.switch_any")));

  const storeId = await chooseStore(database, active, Number(switchAny?.n ?? 0) > 0);
  if (storeId && storeId !== active.lastStoreId) {
    await database
      .update(schema.memberships)
      .set({ lastStoreId: storeId })
      .where(and(eq(schema.memberships.tenantId, active.tenantId), eq(schema.memberships.userId, user.id)));
  }

  await database
    .update(schema.users)
    .set({
      lastLoginAt: now,
      emailVerifiedAt: user.emailVerifiedAt ?? now,
      avatarUrl: profile.picture ?? user.avatarUrl,
    })
    .where(eq(schema.users.id, user.id));

  await writeAudit(
    database,
    { tenantId: active.tenantId, storeId: storeId ?? "", userId: user.id },
    { action: "login", entityType: "user", entityId: user.id, reason: "Google OAuth login", ip: ip ?? undefined },
  );

  return { ok: true, status: "authenticated", userId: user.id, tenantId: active.tenantId, storeId, email: user.email };
}

/** Creates a new pharmacy tenant, main store, Owner role, user, and Google OAuth link. */
export async function createGooglePharmacySignup(
  tx: Tx,
  input: {
    profile: GoogleProfile;
    pharmacyName: string;
    fullName?: string;
    passwordHash?: string | null;
    ip?: string | null;
  },
  now = new Date(),
): Promise<{ userId: string; tenantId: string; storeId: string }> {
  const emailLower = input.profile.email.trim().toLowerCase();
  const [existing] = await tx.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${emailLower}`);
  if (existing) {
    throw new DomainError("EMAIL_EXISTS", "An account with this email already exists. Please sign in with Google.");
  }

  const displayName = input.fullName?.trim() || input.profile.name;
  const [tenant] = await tx.insert(schema.tenants).values({ name: input.pharmacyName.trim() }).returning();
  const [user] = await tx
    .insert(schema.users)
    .values({
      name: displayName,
      email: emailLower,
      passwordHash: input.passwordHash ?? null,
      avatarUrl: input.profile.picture,
      emailVerifiedAt: now,
      lastLoginAt: now,
      isPlatformAdmin: false,
    })
    .returning();

  const [store] = await tx
    .insert(schema.stores)
    .values({ tenantId: tenant.id, name: "Main Store", code: "MAIN", stateCode: "00" })
    .returning();

  const roleIds = await seedSystemRoles(tx, tenant.id);
  await tx.insert(schema.memberships).values({
    tenantId: tenant.id,
    userId: user.id,
    roleId: roleIds.owner,
    allStores: true,
    lastStoreId: store.id,
  });

  await tx.insert(schema.userOauthAccounts).values({
    userId: user.id,
    provider: "google",
    providerAccountId: input.profile.sub,
    email: emailLower,
    emailVerified: "true",
    avatarUrl: input.profile.picture,
  });

  await writeAudit(
    tx,
    { tenantId: tenant.id, storeId: store.id, userId: user.id },
    { action: "create", entityType: "tenant", entityId: tenant.id, reason: "Google OAuth signup", ip: input.ip ?? undefined },
  );

  return { userId: user.id, tenantId: tenant.id, storeId: store.id };
}

/** Accepts a staff invitation using a verified Google profile matching the invited email. */
export async function acceptInviteWithGoogle(
  tx: Tx,
  input: { token: string; profile: GoogleProfile; ip?: string | null },
  now = new Date(),
): Promise<{ userId: string; tenantId: string; storeId: string }> {
  const [inv] = await tx
    .select()
    .from(schema.userInvites)
    .where(eq(schema.userInvites.tokenHash, sha256(input.token)))
    .for("update");
  if (!inv || inv.acceptedAt || inv.expiresAt <= now) {
    throw new DomainError("INVALID_INVITE", "This invitation link is invalid or has expired.");
  }

  const emailLower = input.profile.email.trim().toLowerCase();
  if (inv.email.trim().toLowerCase() !== emailLower) {
    throw new DomainError(
      "EMAIL_MISMATCH",
      `This invitation was sent to ${inv.email}, but you signed in with ${emailLower}.`,
    );
  }

  const [existing] = await tx
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${emailLower}`);

  let userId: string;
  if (existing) {
    userId = existing.id;
    await tx
      .update(schema.users)
      .set({ emailVerifiedAt: existing.emailVerifiedAt ?? now, avatarUrl: input.profile.picture ?? existing.avatarUrl })
      .where(eq(schema.users.id, userId));
  } else {
    const [u] = await tx
      .insert(schema.users)
      .values({
        name: input.profile.name,
        email: emailLower,
        passwordHash: null,
        avatarUrl: input.profile.picture,
        emailVerifiedAt: now,
      })
      .returning({ id: schema.users.id });
    userId = u.id;
  }

  await tx
    .insert(schema.userOauthAccounts)
    .values({
      userId,
      provider: "google",
      providerAccountId: input.profile.sub,
      email: emailLower,
      emailVerified: "true",
      avatarUrl: input.profile.picture,
    })
    .onConflictDoUpdate({
      target: [schema.userOauthAccounts.userId, schema.userOauthAccounts.provider],
      set: { providerAccountId: input.profile.sub, email: emailLower, avatarUrl: input.profile.picture, updatedAt: now },
    });

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
  if (!storeId) throw new DomainError("NO_STORE", "No store is assigned to this role yet.");

  await tx.update(schema.memberships).set({ lastStoreId: storeId }).where(eq(schema.memberships.id, m.id));
  await tx.update(schema.userInvites).set({ acceptedAt: now }).where(eq(schema.userInvites.id, inv.id));
  await writeAudit(
    tx,
    { tenantId: inv.tenantId, storeId, userId },
    { action: "create", entityType: "user_invite", entityId: inv.id, reason: "Google OAuth invite accept", ip: input.ip ?? undefined },
  );

  return { userId, tenantId: inv.tenantId, storeId };
}

/** Links a verified Google profile to a signed-in MediFlow user. */
export async function linkGoogleAccount(
  database: DbOrTx,
  input: { userId: string; profile: GoogleProfile },
  now = new Date(),
): Promise<void> {
  const [taken] = await database
    .select({ userId: schema.userOauthAccounts.userId })
    .from(schema.userOauthAccounts)
    .where(
      and(
        eq(schema.userOauthAccounts.provider, "google"),
        eq(schema.userOauthAccounts.providerAccountId, input.profile.sub),
      ),
    );
  if (taken && taken.userId !== input.userId) {
    throw new DomainError("OAUTH_ALREADY_LINKED", "This Google account is already linked to another MediFlow user.");
  }
  await database
    .insert(schema.userOauthAccounts)
    .values({
      userId: input.userId,
      provider: "google",
      providerAccountId: input.profile.sub,
      email: input.profile.email.trim().toLowerCase(),
      emailVerified: "true",
      avatarUrl: input.profile.picture,
    })
    .onConflictDoUpdate({
      target: [schema.userOauthAccounts.userId, schema.userOauthAccounts.provider],
      set: {
        providerAccountId: input.profile.sub,
        email: input.profile.email.trim().toLowerCase(),
        avatarUrl: input.profile.picture,
        updatedAt: now,
      },
    });
}

/** Unlinks Google from a user only if they have a password set (so they are never locked out). */
export async function unlinkGoogleAccount(database: DbOrTx, userId: string): Promise<void> {
  const [user] = await database
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!user) throw new DomainError("NOT_FOUND", "User not found.");
  if (!user.passwordHash) {
    throw new DomainError("PASSWORD_REQUIRED", "Set a password before disconnecting Google Sign-In.");
  }
  await database
    .delete(schema.userOauthAccounts)
    .where(and(eq(schema.userOauthAccounts.userId, userId), eq(schema.userOauthAccounts.provider, "google")));
}

