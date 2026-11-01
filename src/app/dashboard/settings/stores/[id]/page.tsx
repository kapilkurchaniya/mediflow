import { notFound } from "next/navigation";
import { PageHeader } from "@/app/components/ui";
import { getStoreAction } from "@/app/actions/stores";
import { requirePagePermission } from "@/server/rbac";
import { StoreForm } from "../_components/StoreForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Store Location | MediFlow" };

export default async function EditStorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("store.manage");
  const { id } = await params;

  let store;
  try {
    store = await getStoreAction(id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/settings/stores"
        eyebrow="Multi-Store & Facilities"
        title={`Edit ${store.name}`}
        description={`Update facility details, statutory licences, GSTIN, and operational controls for ${store.code}.`}
      />
      <StoreForm initialData={JSON.parse(JSON.stringify(store))} />
    </div>
  );
}
