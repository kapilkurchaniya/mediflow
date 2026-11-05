import { PageHeader } from "@/app/components/ui";
import { getEWayBillsAction } from "@/app/actions/gst";
import { EWayBillClient } from "./EWayBillClient";

export const dynamic = "force-dynamic";

export default async function EWayBillPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: "all" | "active" | "expiring_soon" | "expired" | "cancelled" }>;
}) {
  const resolved = await searchParams;
  const data = await getEWayBillsAction({ status: resolved.status ?? "all" });

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/gst"
        eyebrow="CGST Rules 138 & 138A"
        title="E-Way Bill Compliance Console"
        description="Monitor consignment validity, update Part-B vehicle details, execute 24-hour statutory cancellations, and generate official inspection slips."
      />

      <EWayBillClient initialData={data} currentFilter={resolved.status ?? "all"} />
    </div>
  );
}

