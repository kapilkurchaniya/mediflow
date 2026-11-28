import { requirePagePermission } from "@/server/rbac";
import { ImsAndTaxClient } from "./ImsAndTaxClient";

export const dynamic = "force-dynamic";

export default async function ImsAndTaxPage() {
  await requirePagePermission("gst.view");
  return <ImsAndTaxClient />;
}
