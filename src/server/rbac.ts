import "server-only";
import { cache } from "react";
import { forbidden } from "next/navigation";
import { and, eq } from "drizzle-orm";
import type { Permission } from "@/lib/permissions";
import { db, schema, type DbOrTx } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { ForbiddenError } from "@/server/errors";

/**
 * Everything an action or page needs to know about WHO is acting. Built once per request.
 * Never accept tenantId / storeId / userId from the client: take them from here.
 */
export interface AuthCtx {
  tenantId: string;
  storeId: string;
  userId: string;
  user: { id: string; name: string; email: string; pharmacistRegNo: string | null };
  permissions: ReadonlySet<Permission>;
  /** "all", or the store ids this membership may work in. */
  allowedStoreIds: "all" | string[];
}

export const can = (ctx: Pick<AuthCtx, "permissions">, p: Permission) => ctx.permissions.has(p);

export function assertPermission(ctx: Pick<AuthCtx, "permissions">, p: Permission): void {
  if (!can(ctx, p)) throw new ForbiddenError(p);
}

/**
 * Loads membership + permissions for a signed-in user. Pure with respect to Next.js (takes the db and the
 * already-validated session), so it can be tested directly.
 * Throws ForbiddenError when the membership is missing/suspended or the session's store is no longer allowed.
 */
export async function loadAuthCtx(
  database: DbOrTx,
  session: { tenantId: string; storeId: string },
  user: { id: string; name: string; email: string; pharmacistRegNo: string | null },
): Promise<AuthCtx> {
  const [m] = await database
    .select()
    .from(schema.memberships)
    .where(and(eq(schema.memberships.tenantId, session.tenantId), eq(schema.memberships.userId, user.id)))
    .limit(1);
  if (!m || m.status !== "active") throw new ForbiddenError("membership.active");

  const rows = await database
    .select({ permission: schema.rolePermissions.permission })
    .from(schema.rolePermissions)
    .where(eq(schema.rolePermissions.roleId, m.roleId));
  const permissions = new Set(rows.map((r) => r.permission as Permission));

  const allowedStoreIds: AuthCtx["allowedStoreIds"] =
    m.allStores || permissions.has("store.switch_any") ? "all" : m.storeIds;
  if (allowedStoreIds !== "all" && !allowedStoreIds.includes(session.storeId)) {
    // e.g. the user was removed from this branch while a session for it was still open
    throw new ForbiddenError("store.access");
  }

  return {
    tenantId: session.tenantId,
    storeId: session.storeId,
    userId: user.id,
    user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: user.pharmacistRegNo },
    permissions,
    allowedStoreIds,
  };
}

/** Per-request cached. Redirects to /login when not signed in (requireAuth). */
export const getAuthCtx = cache(async (): Promise<AuthCtx> => {
  const { session, user } = await requireAuth();
  return loadAuthCtx(db, session, user);
});

/** For Server Actions and domain code: throws ForbiddenError (shown to the user as a message). */
export async function requirePermission(p: Permission): Promise<AuthCtx> {
  const ctx = await getAuthCtx();
  assertPermission(ctx, p);
  return ctx;
}

/**
 * For pages / layouts: renders the 403 page (src/app/forbidden.tsx) instead of crashing.
 * Uses Next's experimental `forbidden()` (next.config.ts: experimental.authInterrupts).
 */
export async function requirePagePermission(p: Permission): Promise<AuthCtx> {
  try {
    return await requirePermission(p);
  } catch (e) {
    if (e instanceof ForbiddenError) forbidden();
    throw e;
  }
}

export type PermissionCheck = { ok: true; ctx: AuthCtx } | { ok: false; error: string };

/**
 * For legacy form actions (`useActionState`) that report failures as `{ error }` instead of throwing:
 *
 *   const auth = await checkPermission("inventory.adjust");
 *   if (!auth.ok) return { error: auth.error };
 *   const ctx = auth.ctx;
 *
 * New actions should use `protectedAction` instead.
 */
export async function checkPermission(p: Permission): Promise<PermissionCheck> {
  try {
    return { ok: true, ctx: await requirePermission(p) };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
