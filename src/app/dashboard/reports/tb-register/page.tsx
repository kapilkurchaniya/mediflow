import { requirePagePermission } from "@/server/rbac";
import { TbRegisterClient } from "./TbRegisterClient";

export const dynamic = "force-dynamic";

export default async function TbRegisterPage() {
  await requirePagePermission("report.view");
  return <TbRegisterClient />;
}
