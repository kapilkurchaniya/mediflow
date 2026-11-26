"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { protectedAction } from "@/server/action";
import { requirePermission } from "@/server/rbac";
import { createSession, generateSessionToken, hashPassword, setSessionCookie, verifyPassword } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { acceptInvite, inviteUser, listTeam, revokeInvite, setMemberStatus, updateMembership } from "@/server/domain/users";
import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES, type Permission } from "@/lib/permissions";

const uuid = z.string().uuid();
const access = {
  roleId: uuid,
  allStores: z.boolean(),
  storeIds: z.array(uuid).default([]),
};
const refresh = () => {
  revalidatePath("/dashboard/settings/users");
};

/** Team members, pending invitations, roles and branches of this pharmacy. Needs `user.manage` (owner). */
export async function getTeam() {
  const ctx = await requirePermission("user.manage");
  return listTeam(db, ctx.tenantId);
}

/** Built-in and custom roles for this pharmacy. Needs `user.manage`. */
export async function getRolesOverview() {
  const ctx = await requirePermission("user.manage");
  const dbRoles = await db
    .select()
    .from(schema.roles)
    .where(eq(schema.roles.tenantId, ctx.tenantId))
    .orderBy(asc(schema.roles.isSystem), asc(schema.roles.name));

  if (dbRoles.length === 0) {
    return SYSTEM_ROLES.map((r) => ({
      id: r.key,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: true,
      permissions: r.permissions.map((p) => ({ key: p, label: PERMISSIONS[p] })),
      count: r.permissions.length,
      total: ALL_PERMISSIONS.length,
    }));
  }

  const roleIds = dbRoles.map((r) => r.id);
  const perms = await db
    .select({ roleId: schema.rolePermissions.roleId, permission: schema.rolePermissions.permission })
    .from(schema.rolePermissions)
    .where(inArray(schema.rolePermissions.roleId, roleIds));

  const permsByRole = new Map<string, Permission[]>();
  for (const row of perms) {
    const permKey = row.permission as Permission;
    if (!(permKey in PERMISSIONS)) continue;
    const list = permsByRole.get(row.roleId) ?? [];
    list.push(permKey);
    permsByRole.set(row.roleId, list);
  }

  return dbRoles.map((r) => {
    const list = permsByRole.get(r.id) ?? [];
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description ?? "",
      isSystem: r.isSystem,
      permissions: list.map((p) => ({ key: p, label: PERMISSIONS[p] })),
      count: list.length,
      total: ALL_PERMISSIONS.length,
    };
  });
}

export const createCustomRoleAction = protectedAction("user.manage")
  .inputSchema(
    z.object({
      name: z.string().trim().min(2, "Role name is required").max(50),
      description: z.string().trim().max(200).optional().default(""),
      permissions: z.array(z.string()).min(1, "Select at least one permission"),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const validPerms = parsedInput.permissions.filter((p): p is Permission => p in PERMISSIONS);
    if (validPerms.length === 0) throw new DomainError("INVALID_PERMISSIONS", "Select at least one valid permission.");

    const slug = parsedInput.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 32);
    const key = `custom_${slug || "role"}_${Date.now().toString(36).slice(-4)}`;

    const created = await db.transaction(async (tx) => {
      const [role] = await tx
        .insert(schema.roles)
        .values({
          tenantId: ctx.tenantId,
          key,
          name: parsedInput.name,
          description: parsedInput.description || null,
          isSystem: false,
        })
        .returning({ id: schema.roles.id, key: schema.roles.key });

      await tx
        .insert(schema.rolePermissions)
        .values(validPerms.map((permission) => ({ roleId: role.id, permission })))
        .onConflictDoNothing();

      return role;
    });

    revalidatePath("/dashboard/settings/roles");
    revalidatePath("/dashboard/settings/users");
    return created;
  });

export const updateCustomRoleAction = protectedAction("user.manage")
  .inputSchema(
    z.object({
      roleId: uuid,
      name: z.string().trim().min(2, "Role name is required").max(50),
      description: z.string().trim().max(200).optional().default(""),
      permissions: z.array(z.string()).min(1, "Select at least one permission"),
    })
  )
  .action(async ({ parsedInput, ctx }) => {
    const validPerms = parsedInput.permissions.filter((p): p is Permission => p in PERMISSIONS);
    if (validPerms.length === 0) throw new DomainError("INVALID_PERMISSIONS", "Select at least one valid permission.");

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: schema.roles.id, isSystem: schema.roles.isSystem })
        .from(schema.roles)
        .where(and(eq(schema.roles.id, parsedInput.roleId), eq(schema.roles.tenantId, ctx.tenantId)));

      if (!existing) throw new DomainError("ROLE_NOT_FOUND", "Role not found.");
      if (existing.isSystem) throw new DomainError("SYSTEM_ROLE_LOCKED", "Built-in system roles cannot be modified.");

      await tx
        .update(schema.roles)
        .set({ name: parsedInput.name, description: parsedInput.description || null })
        .where(and(eq(schema.roles.id, existing.id), eq(schema.roles.tenantId, ctx.tenantId)));

      await tx.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, existing.id));
      await tx
        .insert(schema.rolePermissions)
        .values(validPerms.map((permission) => ({ roleId: existing.id, permission })));
    });

    revalidatePath("/dashboard/settings/roles");
    revalidatePath("/dashboard/settings/users");
    return { updated: true };
  });

/** Creates an invitation. The raw token is returned ONCE, to build the link; only its hash is stored. */
export const inviteUserAction = protectedAction("user.manage")
  .inputSchema(z.object({ email: z.string().trim().min(1, "Enter an email address."), ...access }))
  .action(async ({ parsedInput: i, ctx }) => {
    const r = await db.transaction((tx) => inviteUser(tx, ctx, i));
    refresh();
    return { token: r.token, expiresAt: r.expiresAt.toISOString() };
  });

export const revokeInviteAction = protectedAction("user.manage")
  .inputSchema(z.object({ inviteId: uuid }))
  .action(async ({ parsedInput: i, ctx }) => {
    await db.transaction((tx) => revokeInvite(tx, ctx, i.inviteId));
    refresh();
    return { revoked: true };
  });

export const updateMemberAction = protectedAction("user.manage")
  .inputSchema(z.object({ userId: uuid, ...access }))
  .action(async ({ parsedInput: i, ctx }) => {
    await db.transaction((tx) => updateMembership(tx, ctx, i.userId, i));
    refresh();
    return { updated: true };
  });

export const setMemberStatusAction = protectedAction("user.manage")
  .inputSchema(z.object({ userId: uuid, status: z.enum(["active", "suspended"]) }))
  .action(async ({ parsedInput: i, ctx }) => {
    await db.transaction((tx) => setMemberStatus(tx, ctx, i.userId, i.status));
    refresh();
    return { updated: true };
  });

/** Public: the invitation page posts here. The token in the link is the credential. */
export async function acceptInviteAction(
  token: string,
  prevState: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  let result: { userId: string; tenantId: string; storeId: string };
  try {
    result = await db.transaction((tx) =>
      acceptInvite(
        tx,
        { token, name: (formData.get("name") as string) ?? undefined, password: (formData.get("password") as string) ?? "", ip },
        verifyPassword,
        hashPassword,
      ),
    );
  } catch (e) {
    if (e instanceof DomainError) return { error: e.message };
    console.error("[acceptInviteAction]", e);
    return { error: "Something went wrong. Please try again." };
  }
  const session = generateSessionToken();
  await createSession(session, result.userId, result.tenantId, result.storeId);
  await setSessionCookie(session);
  redirect("/dashboard");
}
