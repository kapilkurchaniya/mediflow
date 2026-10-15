import React from "react";
import { getComplianceOverview, getDispensingLogs } from "@/app/actions/compliance";
import { ComplianceRegisterView } from "../ComplianceRegisterView";

export const metadata = {
  title: "Schedule H1 Statutory Register (Form 35) | MediFlow",
  description: "Mandatory Schedule H1 drug supply register with 3-year audit log preservation under Drugs & Cosmetics Rules 1945.",
};

export default async function ScheduleH1Page() {
  const stats = await getComplianceOverview();
  const logs = await getDispensingLogs({
    registerType: "schedule_h1",
    limit: 100,
  });

  return (
    <ComplianceRegisterView
      initialStats={stats}
      initialLogs={logs as any}
      defaultRegister="schedule_h1"
    />
  );
}
