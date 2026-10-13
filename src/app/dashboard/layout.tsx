import { getCurrentSession } from "@/server/auth";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { DashboardShell } from "./DashboardShell";

async function getShellContext() {
  try {
    const { session, user } = await getCurrentSession();
    let storeName = "My Pharmacy";
    if (session?.storeId) {
      const [store] = await db
        .select({ name: schema.stores.name })
        .from(schema.stores)
        .where(eq(schema.stores.id, session.storeId))
        .limit(1);
      if (store?.name) storeName = store.name;
    }
    return {
      userName: user?.name ?? "Pharmacist",
      userEmail: user?.email ?? "",
      storeName,
    };
  } catch {
    return { userName: "Pharmacist", userEmail: "", storeName: "My Pharmacy" };
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getShellContext();

  return <DashboardShell {...ctx}>{children}</DashboardShell>;
}

