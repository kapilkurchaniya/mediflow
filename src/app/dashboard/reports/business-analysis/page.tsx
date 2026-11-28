import { requirePagePermission } from "@/server/rbac";
import { BusinessAnalysisClient } from "./BusinessAnalysisClient";

export const dynamic = "force-dynamic";

export default async function BusinessAnalysisPage() {
  await requirePagePermission("report.view");
  return <BusinessAnalysisClient />;
}
