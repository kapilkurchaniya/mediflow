import React from "react";
import { requirePagePermission, getAuthCtx } from "@/server/rbac";
import {
  getStoreLicenseSummary,
  getAllStoreLicenseAlerts,
  getPharmacistRegistrationAlerts,
} from "@/server/domain/compliance/license-tracker";
import { LicenseTrackerClient } from "./LicenseTrackerClient";

export const metadata = {
  title: "Drug Licenses & Regulatory Renewals | MediFlow",
  description:
    "Track Form 20, 21, 20B, 21B validity dates, FSSAI registrations, and Chief Pharmacist council credentials under Drugs & Cosmetics Rules 1945.",
};

export default async function LicensesCompliancePage() {
  await requirePagePermission("report.view");
  const ctx = await getAuthCtx();

  const [storeReports, storeAlerts, pharmacistAlerts] = await Promise.all([
    getStoreLicenseSummary(ctx.tenantId),
    getAllStoreLicenseAlerts(ctx.tenantId),
    getPharmacistRegistrationAlerts(ctx.tenantId),
  ]);

  return (
    <LicenseTrackerClient
      storeReports={storeReports}
      storeAlerts={storeAlerts}
      pharmacistAlerts={pharmacistAlerts}
      canManageStores={ctx.permissions.has("store.manage")}
      canManageSettings={ctx.permissions.has("settings.manage")}
    />
  );
}
