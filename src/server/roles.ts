/**
 * System roles (owner, manager, pharmacist, ...) live in the database per tenant, as rows in `roles` and
 * `role_permissions`, generated from the templates in src/lib/permissions.ts. This file keeps the two in sync.
 * It deliberately imports no Next.js code so migrate.ts and scripts can use it.
 */
import { and, eq, notInArray } from "drizzle-orm";
import { SYSTEM_ROLES } from "../lib/permissions";
import type { DbOrTx } from "./db";
import { rolePermissions, roles, tenants } from "./db/schema";

/**
 * Creates or updates the system roles of one tenant and makes their permission sets match the templates
 * exactly (system roles are authoritative; custom roles are never touched). Idempotent.
 * Returns role ids by key, e.g. { owner: "...", cashier: "..." }.
 */
export async function seedSystemRoles(tx: DbOrTx, tenantId: string): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const r of SYSTEM_ROLES) {
    const [role] = await tx
      .insert(roles)
      .values({ tenantId, key: r.key, name: r.name, description: r.description, isSystem: true })
      .onConflictDoUpdate({
        target: [roles.tenantId, roles.key],
        set: { name: r.name, description: r.description, isSystem: true },
      })
      .returning({ id: roles.id });
    ids[r.key] = role.id;

    await tx
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.roleId, role.id), notInArray(rolePermissions.permission, r.permissions)));
    await tx
      .insert(rolePermissions)
      .values(r.permissions.map((permission) => ({ roleId: role.id, permission })))
      .onConflictDoNothing();
  }
  return ids;
}

/** Runs seedSystemRoles for every tenant. Called after migrations so existing tenants get permissions. */
export async function backfillSystemRoles(db: DbOrTx): Promise<number> {
  const all = await db.select({ id: tenants.id }).from(tenants);
  for (const t of all) await seedSystemRoles(db, t.id);
  return all.length;
}
