import { getCurrentSession } from "@/server/auth";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { getAuthCtx } from "@/server/rbac";
import { ForbiddenError } from "@/server/errors";
import { listAllowedStores, type AllowedStoreItem } from "@/server/domain/stores";
import { DashboardShell } from "./DashboardShell";

async function getShellContext() {
  try {
    const { session, user } = await getCurrentSession();
    let storeName = "My Pharmacy";
    let currentStore: AllowedStoreItem | null = null;
    let allowedStores: AllowedStoreItem[] = [];

    if (session?.storeId) {
      const [store] = await db
        .select({
          id: schema.stores.id,
          name: schema.stores.name,
          code: schema.stores.code,
          kind: schema.stores.kind,
          stateCode: schema.stores.stateCode,
          gstin: schema.stores.gstin,
          isActive: schema.stores.isActive,
        })
        .from(schema.stores)
        .where(eq(schema.stores.id, session.storeId))
        .limit(1);

      if (store) {
        currentStore = store as AllowedStoreItem;
        storeName = store.name;
      }
    }

    if (session?.tenantId && user?.id) {
      allowedStores = await listAllowedStores(db, {
        tenantId: session.tenantId,
        userId: user.id,
      });
    }

    return {
      userName: user?.name ?? "Pharmacist",
      userEmail: user?.email ?? "",
      userId: user?.id,
      storeName,
      currentStore,
      allowedStores,
    };
  } catch {
    return {
      userName: "Pharmacist",
      userEmail: "",
      userId: undefined,
      storeName: "My Pharmacy",
      currentStore: null,
      allowedStores: [],
    };
  }
}

/**
 * What the user may do, so the menu can hide the rest. This is for display only: every page and action
 * enforces permissions itself. A membership problem (suspended, store no longer allowed) means an empty
 * menu; the pages then show the 403 screen.
 */
async function getPermissions(): Promise<string[]> {
  try {
    return [...(await getAuthCtx()).permissions];
  } catch (e) {
    if (e instanceof ForbiddenError) return [];
    throw e; // includes the redirect to /login when there is no session
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [ctx, permissions] = await Promise.all([getShellContext(), getPermissions()]);

  return (
    <DashboardShell {...ctx} permissions={permissions}>
      {children}
    </DashboardShell>
  );
}
