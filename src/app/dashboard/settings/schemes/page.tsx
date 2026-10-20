import { PageHeader } from "@/app/components/ui";
import { getSchemes } from "@/app/actions/schemes";
import { SchemesListClient } from "./SchemesListClient";
import { requirePagePermission } from "@/server/rbac";

export const dynamic = "force-dynamic";

export default async function SchemesPage() {
  await requirePagePermission("purchase.view");
  const schemes = await getSchemes();

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/inventory"
        eyebrow="Discounts & Trade Promotions"
        title="Trade Schemes & Deals"
        description="Configure automated Buy X Get Y bonus stock, volume percentage discounts, and supplier trade schemes."
      />

      <SchemesListClient initialSchemes={schemes} />
    </div>
  );
}
