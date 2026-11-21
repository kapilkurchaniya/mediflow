import { redirect } from "next/navigation";
import { getCurrentSession } from "@/server/auth";
import { getAuthCtx, type AuthCtx } from "@/server/rbac";
import { ForbiddenError } from "@/server/errors";
import { type AllowedStoreItem } from "@/server/domain/stores";
import { getCachedTenantStores } from "@/server/domain/stores/cached";
import { DashboardShell } from "./DashboardShell";

/**
 * What the user may do, so the menu can hide the rest. This is for display only: every page and action
 * enforces permissions itself. A membership problem (suspended, store no longer allowed) means an empty
 * menu; the pages then show the 403 screen.
 */
async function getSafeAuthCtx(): Promise<AuthCtx | null> {
  try {
    return await getAuthCtx();
  } catch (e) {
    if (e instanceof ForbiddenError) return null;
    throw e; // includes the redirect to /login when there is no session
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, user } = await getCurrentSession().catch(() => ({ session: null, user: null }));

  if (user && !user.passwordHash) {
    redirect("/setup-password?next=/dashboard");
  }

  const [authCtx, tenantStores] = await Promise.all([
    getSafeAuthCtx(),
    session?.tenantId ? getCachedTenantStores(session.tenantId).catch(() => []) : Promise.resolve([]),
  ]);

  let storeName = "My Pharmacy";
  let currentStore: AllowedStoreItem | null = null;
  let allowedStores: AllowedStoreItem[] = [];

  if (session?.storeId) {
    const found = tenantStores.find((s) => s.id === session.storeId);
    if (found) {
      currentStore = found as AllowedStoreItem;
      storeName = found.name;
    }
  }

  if (authCtx) {
    const activeStores = tenantStores.filter((s) => s.isActive);
    if (authCtx.allowedStoreIds === "all") {
      allowedStores = activeStores as AllowedStoreItem[];
    } else {
      const allowedSet = new Set(authCtx.allowedStoreIds);
      allowedStores = activeStores.filter((s) => allowedSet.has(s.id)) as AllowedStoreItem[];
    }
  }

  const permissions = authCtx ? [...authCtx.permissions] : [];

  return (
    <DashboardShell
      userName={user?.name ?? "Pharmacist"}
      userEmail={user?.email ?? ""}
      userId={user?.id}
      tenantId={session?.tenantId}
      storeName={storeName}
      currentStore={currentStore}
      allowedStores={allowedStores}
      permissions={permissions}
    >
      {children}
    </DashboardShell>
  );
}
