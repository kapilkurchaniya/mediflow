"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { protectedAction } from "@/server/action";
import { requirePermission } from "@/server/rbac";
import { createSession, generateSessionToken, hashPassword, setSessionCookie, verifyPassword } from "@/server/auth";
import { DomainError } from "@/server/errors";
import { acceptInvite, inviteUser, listTeam, revokeInvite, setMemberStatus, updateMembership } from "@/server/domain/users";
import { ALL_PERMISSIONS, PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";

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

/** The built-in roles and what each may do (read-only). Needs `user.manage`. */
export async function getRolesOverview() {
  await requirePermission("user.manage");
  return SYSTEM_ROLES.map((r) => ({
    key: r.key,
    name: r.name,
    description: r.description,
    permissions: r.permissions.map((p) => ({ key: p, label: PERMISSIONS[p] })),
    count: r.permissions.length,
    total: ALL_PERMISSIONS.length,
  }));
}

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
