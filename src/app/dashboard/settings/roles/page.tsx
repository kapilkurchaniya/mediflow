import { getRolesOverview } from "@/app/actions/users";
import { ALL_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";
import { requirePagePermission } from "@/server/rbac";
import { RolesClient } from "./RolesClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Roles & permissions | MediFlow" };

export default async function RolesPage() {
  await requirePagePermission("user.manage");
  const roles = await getRolesOverview();
  const allPermissions = ALL_PERMISSIONS.map((key) => ({
    key,
    label: PERMISSIONS[key],
  }));

  return <RolesClient initialRoles={roles} allPermissions={allPermissions} />;
}
