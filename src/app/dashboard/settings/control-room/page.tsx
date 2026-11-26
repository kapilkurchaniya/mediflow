import { requirePagePermission } from "@/server/rbac";
import { PageHeader } from "@/app/components/ui";
import { getControlRoomDataAction } from "@/app/actions/control-room";
import { ControlRoomClient } from "./ControlRoomClient";

export const metadata = {
  title: "Control Room & Audit Log | MediFlow Settings",
};

export default async function ControlRoomPage() {
  await requirePagePermission("settings.manage");
  const data = await getControlRoomDataAction();

  return (
    <div className="page space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Control Room, Audit Edit-Log & Backup"
        description="Configure billing policies, regional print language, GST composition mode, inspect MCA audit logs, and export backups."
      />
      <ControlRoomClient
        storeName={data.storeName}
        initialSettings={data.settings}
        auditLogs={data.auditLogs}
      />
    </div>
  );
}
