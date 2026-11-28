import { requirePagePermission } from "@/server/rbac";
import { WholesaleClient } from "./WholesaleClient";

export const dynamic = "force-dynamic";

export default async function WholesalePage() {
  await requirePagePermission("sale.view");
  return <WholesaleClient />;
}
