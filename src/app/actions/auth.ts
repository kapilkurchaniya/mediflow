"use server";

import { redirect } from "next/navigation";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, createSession, setSessionCookie, deleteSessionCookie, invalidateSession, getCurrentSession } from "@/server/auth";

export async function loginAction(prevState: any, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()));

  const user = users[0];

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Invalid email or password" };
  }

  // Fetch user's membership to get tenantId and storeId
  const memberships = await db
    .select()
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id))
    .limit(1);

  let tenantId = null;
  let storeId = null;

  if (memberships.length > 0) {
    tenantId = memberships[0].tenantId;
    // Get first store of this tenant
    const stores = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.tenantId, tenantId))
      .limit(1);
    
    if (stores.length > 0) {
      storeId = stores[0].id;
    }
  }

  const token = (await import("@/server/auth")).generateSessionToken();
  await createSession(token, user.id, tenantId, storeId);
  await setSessionCookie(token);

  // Redirect to dashboard
  redirect("/dashboard");
}

export async function registerAction(prevState: any, formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const pharmacyName = formData.get("pharmacyName") as string;

  if (!name || !email || !password || !pharmacyName) {
    return { error: "All fields are required" };
  }

  // Check if user already exists
  const existingUsers = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()));

  if (existingUsers.length > 0) {
    return { error: "Email already in use" };
  }

  const passwordHash = await hashPassword(password);

  // Use a transaction to create User, Tenant, and Store
  const result = await db.transaction(async (tx) => {
    // Create Tenant
    const [tenant] = await tx.insert(schema.tenants).values({
      name: pharmacyName,
    }).returning();

    // Create User
    const [user] = await tx.insert(schema.users).values({
      name,
      email: email.toLowerCase(),
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

    // Create Role and Membership for the Owner
    const [role] = await tx.insert(schema.roles).values({
      tenantId: tenant.id,
      key: "owner",
      name: "Owner",
      isSystem: true,
    }).returning();

    // Give role all permissions (in a real app, populate role_permissions)
    await tx.insert(schema.memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      roleId: role.id,
      allStores: true,
    });

    return { user, tenant, store };
  });

  // Create session
  const token = (await import("@/server/auth")).generateSessionToken();
  await createSession(token, result.user.id, result.tenant.id, result.store.id);
  await setSessionCookie(token);

  redirect("/dashboard");
}

export async function logoutAction() {
  const { session } = await getCurrentSession();
  if (session) {
    await invalidateSession(session.id);
  }
  await deleteSessionCookie();
  redirect("/login");
}
