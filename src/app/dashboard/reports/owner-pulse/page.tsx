import { requirePagePermission } from "@/server/rbac";
import { OwnerPulseClient } from "./OwnerPulseClient";

export const dynamic = "force-dynamic";

export default async function OwnerPulsePage() {
  await requirePagePermission("report.view");
  return <OwnerPulseClient />;
}
