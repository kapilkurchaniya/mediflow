"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db, schema } from "@/server/db";
import { sql } from "drizzle-orm";
import { seedSystemRoles } from "@/server/roles";
import { hashPassword, verifyPassword, createSession, setSessionCookie, deleteSessionCookie, invalidateSession, getCurrentSession, requireAuth } from "@/server/auth";
import { attemptLogin, changePassword } from "@/server/domain/login";

export async function loginAction(prevState: { error?: string; success?: boolean } | null, formData: FormData) {
  const email = (formData.get("email") as string) ?? "";
  const password = (formData.get("password") as string) ?? "";

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;

  const result = await attemptLogin(db, { email, password, ip }, verifyPassword);
  if (!result.ok) return { error: result.error };

  const token = (await import("@/server/auth")).generateSessionToken();
  await createSession(token, result.userId, result.tenantId, result.storeId);
  await setSessionCookie(token);

  // Redirect to dashboard
  redirect("/dashboard");
}

/** Change the signed-in user's own password and sign out every other device. */
export async function changePasswordAction(prevState: { error?: string; success?: string } | null, formData: FormData) {
  const { session, user } = await requireAuth();
  const result = await changePassword(
    db,
    {
      userId: user.id,
      keepSessionId: session.id,
      current: (formData.get("current") as string) ?? "",
      next: (formData.get("next") as string) ?? "",
      confirm: (formData.get("confirm") as string) ?? "",
    },
    verifyPassword,
    hashPassword,
    { tenantId: session.tenantId, storeId: session.storeId },
  );
  if (!result.ok) return { error: result.error };
  return {
    success:
      result.signedOutElsewhere > 0
        ? `Password changed. ${result.signedOutElsewhere} other signed-in device${result.signedOutElsewhere === 1 ? " was" : "s were"} signed out.`
        : "Password changed.",
  };
}

export async function registerAction(prevState: { error?: string; success?: boolean } | null, formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const pharmacyName = formData.get("pharmacyName") as string;

  if (!name || !email || !password || !pharmacyName) {
    return { error: "All fields are required" };
  }

  const emailLower = email.trim().toLowerCase();

  try {
    // Check if user already exists (case-insensitive)
    const existingUsers = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.email}) = ${emailLower}`);

    if (existingUsers.length > 0) {
      return { error: "Email already in use" };
    }

    const passwordHash = await hashPassword(password);

    // Use a transaction to create User, Tenant, and Store
    const result = await db.transaction(async (tx) => {
      // Create Tenant
      const [tenant] = await tx.insert(schema.tenants).values({
        name: pharmacyName.trim(),
      }).returning();

      // Create User
      const [user] = await tx.insert(schema.users).values({
        name: name.trim(),
        email: emailLower,
        passwordHash,
        isPlatformAdmin: false,
      }).returning();

      // Create Store
      const [store] = await tx.insert(schema.stores).values({
        tenantId: tenant.id,
        name: "Main Store",
        code: "MAIN",
        stateCode: "00", // Default or ask user later
      }).returning();

      // Create the system roles (owner, manager, pharmacist, ...) with their permissions, and make this user the Owner
      const roleIds = await seedSystemRoles(tx, tenant.id);
      await tx.insert(schema.memberships).values({
        tenantId: tenant.id,
        userId: user.id,
        roleId: roleIds.owner,
        allStores: true,
      });

      return { user, tenant, store };
    });

    // Create session
    const token = (await import("@/server/auth")).generateSessionToken();
    await createSession(token, result.user.id, result.tenant.id, result.store.id);
    await setSessionCookie(token);
  } catch (err) {
    console.error("[registerAction] Registration failed:", err);
    return { error: "Unable to create account right now. Please try again." };
  }

  // Redirect newly registered pharmacy to Onboarding Wizard
  redirect("/onboarding");
}

export async function logoutAction() {
  const { session } = await getCurrentSession();
  if (session) {
    await invalidateSession(session.id);
  }
  await deleteSessionCookie();
  redirect("/login");
}
