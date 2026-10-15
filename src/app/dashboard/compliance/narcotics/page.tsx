import React from "react";
import { getComplianceOverview, getDispensingLogs } from "@/app/actions/compliance";
import { ComplianceRegisterView } from "../ComplianceRegisterView";

export const metadata = {
  title: "Narcotics & Controlled Substances Register (NDPS) | MediFlow",
  description: "Strict 5-year retention audit trail for Narcotic and NDPS Act scheduled pharmaceuticals.",
};

export default async function NarcoticsPage() {
  const stats = await getComplianceOverview();
  const logs = await getDispensingLogs({
    registerType: "narcotics",
    limit: 100,
  });

  return (
    <ComplianceRegisterView
      initialStats={stats}
      initialLogs={logs as any}
      defaultRegister="narcotics"
    />
  );
}
