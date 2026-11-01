import { PageHeader } from "@/app/components/ui";
import { requirePagePermission } from "@/server/rbac";
import { StoreForm } from "../_components/StoreForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New Store / Warehouse | MediFlow" };

export default async function NewStorePage() {
  await requirePagePermission("store.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/settings/stores"
        eyebrow="Multi-Store & Facilities"
        title="Add New Location"
        description="Register a new retail branch or central warehouse replenishment hub under this pharmacy enterprise."
      />
      <StoreForm />
    </div>
  );
}
