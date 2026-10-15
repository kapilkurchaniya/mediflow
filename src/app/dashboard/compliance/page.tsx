import React from "react";
import { getComplianceOverview, getDispensingLogs } from "@/app/actions/compliance";
import { ComplianceRegisterView } from "./ComplianceRegisterView";

export const metadata = {
  title: "Drug Compliance Registers | MediFlow",
  description: "Statutory inspection registers for Schedule H, Schedule H1, Schedule X, and Narcotics under Indian Drugs & Cosmetics Rules.",
};

export default async function CompliancePage() {
  const stats = await getComplianceOverview();
  const logs = await getDispensingLogs({ limit: 100 });

  return (
    <ComplianceRegisterView
      initialStats={stats}
      initialLogs={logs as any}
      defaultRegister="all"
    />
  );
}
