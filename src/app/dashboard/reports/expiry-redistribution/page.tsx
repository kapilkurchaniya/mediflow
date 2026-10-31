import React from "react";
import { ReportShell } from "@/app/components/ReportShell";
import {
  getExpiryRedistributionReportAction,
  getActiveStoresForRedistributionAction,
} from "@/app/actions/expiry-redistribution";
import { ExpiryRedistributionClient } from "./ExpiryRedistributionClient";

export const metadata = {
  title: "Expiry Redistribution Suggestions | MediFlow Reports",
  description:
    "Detect batches nearing expiry in slow-moving branches and reallocate to high-velocity stores before expiration.",
};

export default async function ExpiryRedistributionPage() {
  const [report, stores] = await Promise.all([
    getExpiryRedistributionReportAction(),
    getActiveStoresForRedistributionAction(),
  ]);

  return (
    <ReportShell
      eyebrow="Chain Optimization"
      title="Expiry Redistribution Engine"
      description="Prevent inventory write-offs by identifying near-expiry batches (30–120 days) at low-velocity branches and matching them with branches where they will sell out before expiring."
      backHref="/dashboard/reports"
      backLabel="Back to Reports Hub"
    >
      <ExpiryRedistributionClient initialReport={report} stores={stores} />
    </ReportShell>
  );
}

