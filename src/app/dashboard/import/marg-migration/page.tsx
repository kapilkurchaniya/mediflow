import { requirePagePermission } from "@/server/rbac";
import { MargMigrationClient } from "./MargMigrationClient";

export const dynamic = "force-dynamic";

export default async function MargMigrationPage() {
  await requirePagePermission("purchase.create");
  return <MargMigrationClient />;
}
