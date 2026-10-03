import { AIAssistant } from "@/app/components/AIAssistant";
import { Sidebar } from "@/app/components/Sidebar";
import { Topbar } from "@/app/components/Topbar";
import { getCurrentSession } from "@/server/auth";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";

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

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar {...ctx} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
      <AIAssistant />
    </div>
  );
}
