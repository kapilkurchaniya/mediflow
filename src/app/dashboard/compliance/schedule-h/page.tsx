import React from "react";
import { getComplianceOverview, getDispensingLogs } from "@/app/actions/compliance";
import { ComplianceRegisterView } from "../ComplianceRegisterView";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "Schedule H Statutory Register | MediFlow",
  description: "Statutory Schedule H prescription drug supply register under Indian Drugs & Cosmetics Rules.",
};

export default async function ScheduleHPage() {
  await requirePagePermission("report.view");
  const stats = await getComplianceOverview();
  const logs = await getDispensingLogs({
    registerType: "schedule_h",
    limit: 100,
  });

  return (
    <ComplianceRegisterView
      initialStats={stats}
      initialLogs={logs}
      defaultRegister="schedule_h"
    />
  );
}
