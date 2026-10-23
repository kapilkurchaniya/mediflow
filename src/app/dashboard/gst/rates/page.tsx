import { requirePagePermission } from "@/server/rbac";
import { getGstRateDistribution } from "@/app/actions/gst";
import { RerateClient } from "./RerateClient";

export const metadata = {
  title: "GST 2.0 Re-Rate Tool | MediFlow",
  description: "Bulk update master catalogue GST rates to GST 2.0 statutory rates with full audit trail logging.",
};

export default async function GstReratePage() {
  await requirePagePermission("gst.view");
  const distribution = await getGstRateDistribution();

  return <RerateClient initialDistribution={distribution} />;
}
