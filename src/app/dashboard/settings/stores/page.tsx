import { PageHeader } from "@/app/components/ui";
import { getStoresAction } from "@/app/actions/stores";
import { requirePagePermission } from "@/server/rbac";
import { StoresClient } from "./StoresClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Store Management & Warehouses | MediFlow" };

export default async function StoresPage() {
  await requirePagePermission("store.manage");
  const stores = await getStoresAction();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Multi-Store & Facilities"
        title="Store & Warehouse Management"
        description="Configure retail pharmacy branches, central distribution godowns, GST series, and operational cashier policies."
      />
      <StoresClient initialStores={JSON.parse(JSON.stringify(stores))} />
    </div>
  );
}
