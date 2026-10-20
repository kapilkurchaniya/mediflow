import { PageHeader } from "@/app/components/ui";
import { getRacks } from "@/app/actions/racks";
import { requirePagePermission } from "@/server/rbac";
import { RacksListClient } from "./RacksListClient";

export const dynamic = "force-dynamic";

export default async function RacksPage() {
  await requirePagePermission("medicine.view");
  const racks = await getRacks();

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/inventory"
        eyebrow="Storage & Physical Pharmacy Layout"
        title="Racks & Shelves Management"
        description="Configure aisle, rack, and shelf identifiers to locate stock immediately at the billing counter."
      />

      <RacksListClient initialRacks={racks} />
    </div>
  );
}
