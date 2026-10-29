import { PageHeader } from "@/app/components/ui";
import { getTeam } from "@/app/actions/users";
import { requirePagePermission } from "@/server/rbac";
import { UsersClient } from "./UsersClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Staff & access | MediFlow" };

export default async function UsersPage() {
  const ctx = await requirePagePermission("user.manage");
  const team = await getTeam();
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People & access"
        title="Staff & access"
        description="Invite staff, choose what each person may do, and which branches they can work in. Suspend someone to sign them out and block their login."
      />
      <UsersClient team={JSON.parse(JSON.stringify(team))} currentUserId={ctx.userId} />
    </div>
  );
}
