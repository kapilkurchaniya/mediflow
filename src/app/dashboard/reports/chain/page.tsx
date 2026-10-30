import React from "react";
import { requirePermission } from "@/server/rbac";
import {
  getReportStoresListAction,
  getChainOverviewReportAction,
} from "@/app/actions/reports";
import { ChainReportsClient } from "./ChainReportsClient";

export const metadata = {
  title: "Consolidated Chain Overview | MediFlow",
  description:
    "Multi-store consolidated reports, store ranking, profitability margins, and inventory health analytics.",
};

export default async function ChainReportsPage() {
  const ctx = await requirePermission("report.view");
  const canViewAllStores =
    ctx.permissions.has("report.all_stores") || ctx.allowedStoreIds === "all";

  const stores = await getReportStoresListAction();
  const initialReport = await getChainOverviewReportAction("all");

  return (
    <ChainReportsClient
      initialReport={initialReport}
      stores={stores}
      canViewAllStores={canViewAllStores}
    />
  );
}
