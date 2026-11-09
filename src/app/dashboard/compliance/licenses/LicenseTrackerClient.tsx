"use client";

import React, { useState, useTransition } from "react";
import {
  Award,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Building2,
  UserCheck,
  Edit,
  Printer,
  X,
  Calendar,
  AlertCircle,
  FileText,
  BadgeAlert,
} from "lucide-react";
import type {
  StoreLicenseReport,
  LicenseAlertItem,
  PharmacistAlertItem,
  LicenseEvaluation,
  LicenseAlertUrgency,
} from "@/server/domain/compliance/license-tracker";
import {
  updateStoreLicensesAction,
  updatePharmacistRegistrationAction,
  getPharmacistsListAction,
  type UpdateStoreLicensesInput,
  type UpdatePharmacistRegInput,
} from "@/app/actions/licenses";

interface LicenseTrackerClientProps {
  storeReports: StoreLicenseReport[];
  storeAlerts: LicenseAlertItem[];
  pharmacistAlerts: PharmacistAlertItem[];
  canManageStores: boolean;
  canManageSettings: boolean;
}

export function LicenseTrackerClient({
  storeReports,
  storeAlerts,
  pharmacistAlerts,
  canManageStores,
  canManageSettings,
}: LicenseTrackerClientProps) {
  const [activeTab, setActiveTab] = useState<"stores" | "pharmacists" | "dossier">("stores");
  const [selectedStore, setSelectedStore] = useState<StoreLicenseReport | null>(null);
  const [selectedPharmacist, setSelectedPharmacist] = useState<PharmacistAlertItem | null>(null);

  const [pharmacistOptions, setPharmacistOptions] = useState<
    { id: string; name: string; email: string; regNo: string | null; councilState: string | null }[]
  >([]);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form states for Store License edit modal
  const [storeForm, setStoreForm] = useState<UpdateStoreLicensesInput>({
    storeId: "",
    form20No: "",
    form20Expiry: "",
    form21No: "",
    form21Expiry: "",
    form20bNo: "",
    form20bExpiry: "",
    form21bNo: "",
    form21bExpiry: "",
    fssaiNo: "",
    fssaiExpiry: "",
    chiefPharmacistId: "",
  });

  // Form states for Pharmacist edit modal
  const [pharmForm, setPharmForm] = useState<UpdatePharmacistRegInput>({
    userId: "",
    pharmacistRegNo: "",
    pharmacistRegExpiry: "",
    pharmacistCouncilState: "",
  });

  // KPI Calculations
  const criticalCount = storeAlerts.filter((a) => a.urgency === "critical").length;
  const urgentCount = storeAlerts.filter((a) => a.urgency === "urgent").length;
  const warningCount = storeAlerts.filter((a) => a.urgency === "warning").length;
  const healthyCount = storeReports.filter((s) => s.isCompliant).length;

  const openStoreModal = async (report: StoreLicenseReport) => {
    setSelectedStore(report);
    setErrorMsg(null);
    setSuccessMsg(null);

    const f20 = report.licenses.find((l) => l.type === "form_20");
    const f21 = report.licenses.find((l) => l.type === "form_21");
    const f20b = report.licenses.find((l) => l.type === "form_20b");
    const f21b = report.licenses.find((l) => l.type === "form_21b");
    const fssai = report.licenses.find((l) => l.type === "fssai");

    setStoreForm({
      storeId: report.storeId,
      form20No: f20?.licenseNumber || "",
      form20Expiry: f20?.validTo || "",
      form21No: f21?.licenseNumber || "",
      form21Expiry: f21?.validTo || "",
      form20bNo: f20b?.licenseNumber || "",
      form20bExpiry: f20b?.validTo || "",
      form21bNo: f21b?.licenseNumber || "",
      form21bExpiry: f21b?.validTo || "",
      fssaiNo: fssai?.licenseNumber || "",
      fssaiExpiry: fssai?.validTo || "",
      chiefPharmacistId: report.chiefPharmacist?.id || "",
    });

    if (canManageStores && pharmacistOptions.length === 0) {
      const res = await getPharmacistsListAction();
      if (res.success && res.data) {
        setPharmacistOptions(res.data);
      }
    }
  };

  const handleSaveStoreLicenses = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await updateStoreLicensesAction(storeForm);
      if (res.success) {
        setSuccessMsg("Store licenses and chief pharmacist assignment updated successfully.");
        setTimeout(() => setSelectedStore(null), 1200);
      } else {
        setErrorMsg(res.error || "Failed to update store licenses.");
      }
    });
  };

  const openPharmacistModal = (p: PharmacistAlertItem) => {
    setSelectedPharmacist(p);
    setErrorMsg(null);
    setSuccessMsg(null);
    setPharmForm({
      userId: p.userId,
      pharmacistRegNo: p.regNo || "",
      pharmacistRegExpiry: p.validTo || "",
      pharmacistCouncilState: p.councilState || "",
    });
  };

  const handleSavePharmacist = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await updatePharmacistRegistrationAction(pharmForm);
      if (res.success) {
        setSuccessMsg("Pharmacist registration details updated successfully.");
        setTimeout(() => setSelectedPharmacist(null), 1200);
      } else {
        setErrorMsg(res.error || "Failed to update pharmacist credentials.");
      }
    });
  };

  const renderBadge = (urgency: LicenseAlertUrgency, daysRemaining: number | null) => {
    if (urgency === "critical") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <AlertTriangle className="h-3 w-3" />
          {daysRemaining !== null && daysRemaining < 0
            ? `Expired (${Math.abs(daysRemaining)}d ago)`
            : `Critical (${daysRemaining ?? 0}d)`}
        </span>
      );
    }
    if (urgency === "urgent") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="h-3 w-3" />
          Urgent ({daysRemaining}d)
        </span>
      );
    }
    if (urgency === "warning") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <BadgeAlert className="h-3 w-3" />
          Warning ({daysRemaining}d)
        </span>
      );
    }
    if (urgency === "healthy") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="h-3 w-3" />
          Active ({daysRemaining}d)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
        Not Configured
      </span>
    );
  };

  const renderLicenseCell = (evaluation?: LicenseEvaluation) => {
    if (!evaluation || (!evaluation.licenseNumber && !evaluation.validTo)) {
      return <span className="text-xs text-zinc-400 italic">Not set</span>;
    }
    return (
      <div className="space-y-1">
        <div className="font-mono text-xs font-medium text-zinc-800">
          {evaluation.licenseNumber || "No Number"}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-zinc-500">{evaluation.validTo || "No expiry"}</span>
          {renderBadge(evaluation.urgency, evaluation.daysRemaining)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700 border border-brand-200">
              <Award className="h-3.5 w-3.5" />
              Statutory Compliance
            </span>
            <span className="text-xs text-zinc-500 font-mono">D&C Rules 1945 & FSSAI</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 mt-1">
            Drug Licenses & Regulatory Renewals
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Real-time validity tracking for Form 20, 21, 20B, 21B, FSSAI, and Chief Pharmacist Council registrations across all branches.
          </p>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-secondary inline-flex items-center gap-1.5"
          >
            <Printer className="h-4 w-4" />
            Print Dossier
          </button>
        </div>
      </div>

      {/* Impending Expiry Alert Banner */}
      {criticalCount > 0 && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 shadow-xs print:hidden">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-rose-900">
                Critical Compliance Alert: {criticalCount} License(s) Expired or Expiring in $\le 7$ Days
              </h3>
              <p className="text-xs text-rose-700 leading-relaxed">
                Under Rule 61 of Drugs & Cosmetics Rules 1945, dispensing without an active Form 20/21 or qualified Chief Pharmacist registration is a severe statutory violation punishable by immediate store sealing. Renew immediately via state FDA online portal.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium">
            <Building2 className="h-4 w-4 text-zinc-400" />
            Stores Tracked
          </div>
          <div className="text-2xl font-bold text-zinc-900 mt-2">{storeReports.length}</div>
          <div className="text-xs text-zinc-400 mt-0.5">Active retail & warehouses</div>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
          <div className="flex items-center gap-2 text-emerald-700 text-xs font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Healthy Stores
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-2">{healthyCount}</div>
          <div className="text-xs text-emerald-600 mt-0.5">&gt; 60 days validity</div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-xs">
          <div className="flex items-center gap-2 text-blue-700 text-xs font-medium">
            <BadgeAlert className="h-4 w-4 text-blue-600" />
            Expiring in 60d
          </div>
          <div className="text-2xl font-bold text-blue-900 mt-2">{warningCount}</div>
          <div className="text-xs text-blue-600 mt-0.5">Prepare renewal dossiers</div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <div className="flex items-center gap-2 text-amber-700 text-xs font-medium">
            <Clock className="h-4 w-4 text-amber-600" />
            Expiring in 30d
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-2">{urgentCount}</div>
          <div className="text-xs text-amber-600 mt-0.5">Online renewal pending</div>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-xs col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 text-rose-700 text-xs font-medium">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            Critical / Expired
          </div>
          <div className="text-2xl font-bold text-rose-900 mt-2">{criticalCount}</div>
          <div className="text-xs text-rose-600 mt-0.5">$\le 7$ days or overdue</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200">
        <nav className="flex space-x-6">
          <button
            type="button"
            onClick={() => setActiveTab("stores")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "stores"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Store Drug Licenses ({storeReports.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("pharmacists")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "pharmacists"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Registered Pharmacists ({pharmacistAlerts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("dossier")}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "dossier"
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            Statutory Inspector Dossier
          </button>
        </nav>
      </div>

      {/* Tab Content: Store Licenses */}
      {activeTab === "stores" && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-xs uppercase font-semibold text-zinc-600 tracking-wider">
                <tr>
                  <th className="px-4 py-3">Store Branch</th>
                  <th className="px-4 py-3">Form 20 (Allopathic)</th>
                  <th className="px-4 py-3">Form 21 (Biologicals)</th>
                  <th className="px-4 py-3">FSSAI License</th>
                  <th className="px-4 py-3">Chief Pharmacist</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  {canManageStores && <th className="px-4 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {storeReports.map((report) => {
                  const f20 = report.licenses.find((l) => l.type === "form_20");
                  const f21 = report.licenses.find((l) => l.type === "form_21");
                  const fssai = report.licenses.find((l) => l.type === "fssai");

                  return (
                    <tr key={report.storeId} className="hover:bg-zinc-50/75 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-zinc-900">{report.storeName}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-xs text-zinc-500">{report.storeCode}</span>
                          <span className="text-zinc-300">•</span>
                          <span className="text-xs uppercase text-zinc-500 font-medium">
                            {report.kind}
                          </span>
                          <span className="text-zinc-300">•</span>
                          <span className="text-xs text-zinc-500">State: {report.stateCode}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">{renderLicenseCell(f20)}</td>
                      <td className="px-4 py-3.5">{renderLicenseCell(f21)}</td>
                      <td className="px-4 py-3.5">{renderLicenseCell(fssai)}</td>

                      <td className="px-4 py-3.5">
                        {report.chiefPharmacist ? (
                          <div className="space-y-1">
                            <div className="font-medium text-xs text-zinc-900 flex items-center gap-1">
                              <UserCheck className="h-3 w-3 text-brand-600" />
                              {report.chiefPharmacist.name}
                            </div>
                            <div className="text-[11px] text-zinc-500 font-mono">
                              Reg: {report.chiefPharmacist.regNo || "Pending"}
                              {report.chiefPharmacist.councilState && ` (${report.chiefPharmacist.councilState})`}
                            </div>
                            <div className="flex items-center gap-1">
                              {renderBadge(
                                report.chiefPharmacist.urgency,
                                report.chiefPharmacist.daysRemaining
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 inline-block">
                            No Pharmacist Designated
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {report.isCompliant ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Compliant
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                            Action Required
                          </span>
                        )}
                      </td>

                      {canManageStores && (
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => openStoreModal(report)}
                            className="btn btn-ghost btn-sm text-brand-600 hover:text-brand-700 hover:bg-brand-50"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            Update
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Registered Pharmacists */}
      {activeTab === "pharmacists" && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
          <div className="p-4 border-b border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                State Pharmacy Council Registered Pharmacists
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Qualified Persons registered under Pharmacy Act 1948 supervising dispensing across chain branches.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-xs uppercase font-semibold text-zinc-600 tracking-wider">
                <tr>
                  <th className="px-4 py-3">Pharmacist</th>
                  <th className="px-4 py-3">Council State</th>
                  <th className="px-4 py-3">Registration No</th>
                  <th className="px-4 py-3">Renewal Expiry</th>
                  <th className="px-4 py-3">Assigned Branches</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  {canManageSettings && <th className="px-4 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {pharmacistAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-xs text-zinc-400">
                      No pharmacist registration records found. Add registrations in staff profile settings.
                    </td>
                  </tr>
                ) : (
                  pharmacistAlerts.map((p) => (
                    <tr key={p.userId} className="hover:bg-zinc-50/75 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-zinc-900">{p.name}</div>
                        <div className="text-xs text-zinc-500">{p.email}</div>
                        {p.phone && <div className="text-xs text-zinc-400 font-mono">{p.phone}</div>}
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="text-xs font-medium text-zinc-700">
                          {p.councilState || "State Council not specified"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs font-semibold text-zinc-900">
                          {p.regNo || "Pending Reg No"}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="text-xs text-zinc-700 font-medium">
                          {p.validTo || "No expiry set"}
                        </div>
                        {p.validTo && (
                          <div className="mt-1">
                            {renderBadge(p.urgency, p.daysRemaining)}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="text-xs text-zinc-600">
                          {p.assignedStoreNames.join(", ") || "Unassigned"}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        {renderBadge(p.urgency, p.daysRemaining)}
                      </td>

                      {canManageSettings && (
                        <td className="px-4 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => openPharmacistModal(p)}
                            className="btn btn-ghost btn-sm text-brand-600 hover:text-brand-700 hover:bg-brand-50"
                          >
                            <Edit className="h-3.5 w-3.5" />
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Content: Statutory Inspector Dossier */}
      {activeTab === "dossier" && (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs space-y-6">
          <div className="border-b border-zinc-200 pb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <FileText className="h-5 w-5 text-brand-600" />
                Drugs Inspector Statutory Compliance Dossier
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Official facility licensing overview compiled under Section 22 of Drugs & Cosmetics Act 1940.
              </p>
            </div>
            <div className="text-right text-xs text-zinc-400 font-mono">
              Generated: {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
            </div>
          </div>

          <div className="space-y-4">
            {storeReports.map((report) => (
              <div
                key={report.storeId}
                className="rounded-lg border border-zinc-200 p-4 space-y-3 bg-zinc-50/50"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-zinc-900">{report.storeName}</h4>
                    <span className="font-mono text-xs text-zinc-500">
                      Code: {report.storeCode} | Type: {report.kind.toUpperCase()} | State: {report.stateCode}
                    </span>
                  </div>
                  <div>{renderBadge(report.overallUrgency, null)}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {report.licenses.map((lic) => (
                    <div
                      key={lic.type}
                      className="rounded-md border border-zinc-200 bg-white p-2.5 space-y-1"
                    >
                      <div className="font-semibold text-zinc-800">{lic.title}</div>
                      <div className="font-mono text-zinc-600">{lic.licenseNumber || "N/A"}</div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-100">
                        <span>Valid till: {lic.validTo || "N/A"}</span>
                        {renderBadge(lic.urgency, lic.daysRemaining)}
                      </div>
                    </div>
                  ))}

                  {report.chiefPharmacist && (
                    <div className="rounded-md border border-brand-200 bg-brand-50/30 p-2.5 space-y-1">
                      <div className="font-semibold text-brand-900">Chief Pharmacist</div>
                      <div className="text-zinc-800">{report.chiefPharmacist.name}</div>
                      <div className="font-mono text-zinc-600 text-[11px]">
                        Reg: {report.chiefPharmacist.regNo || "N/A"} ({report.chiefPharmacist.councilState || "State Council"})
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-brand-100">
                        <span>Valid till: {report.chiefPharmacist.councilExpiry || "N/A"}</span>
                        {renderBadge(report.chiefPharmacist.urgency, report.chiefPharmacist.daysRemaining)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Update Store Licenses */}
      {selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  Update Licenses: {selectedStore.storeName}
                </h3>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">
                  Store Code: {selectedStore.storeCode} ({selectedStore.kind.toUpperCase()})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStore(null)}
                className="btn btn-ghost btn-icon text-zinc-400 hover:text-zinc-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSaveStoreLicenses} className="space-y-4">
              {/* Form 20 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Form 20 No. (Retail Allopathic)
                  </label>
                  <input
                    type="text"
                    value={storeForm.form20No || ""}
                    onChange={(e) => setStoreForm({ ...storeForm, form20No: e.target.value })}
                    placeholder="e.g. 20-DL-12345"
                    className="input input-sm w-full font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Form 20 Expiry Date
                  </label>
                  <input
                    type="date"
                    value={storeForm.form20Expiry || ""}
                    onChange={(e) => setStoreForm({ ...storeForm, form20Expiry: e.target.value })}
                    className="input input-sm w-full text-xs"
                  />
                </div>
              </div>

              {/* Form 21 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Form 21 No. (Biologicals Sch C/C1)
                  </label>
                  <input
                    type="text"
                    value={storeForm.form21No || ""}
                    onChange={(e) => setStoreForm({ ...storeForm, form21No: e.target.value })}
                    placeholder="e.g. 21-DL-12345"
                    className="input input-sm w-full font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Form 21 Expiry Date
                  </label>
                  <input
                    type="date"
                    value={storeForm.form21Expiry || ""}
                    onChange={(e) => setStoreForm({ ...storeForm, form21Expiry: e.target.value })}
                    className="input input-sm w-full text-xs"
                  />
                </div>
              </div>

              {/* Wholesale 20B/21B */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Form 20B No. (Wholesale Allopathic)
                  </label>
                  <input
                    type="text"
                    value={storeForm.form20bNo || ""}
                    onChange={(e) => setStoreForm({ ...storeForm, form20bNo: e.target.value })}
                    placeholder="e.g. 20B-DL-6789"
                    className="input input-sm w-full font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Form 20B Expiry Date
                  </label>
                  <input
                    type="date"
                    value={storeForm.form20bExpiry || ""}
                    onChange={(e) => setStoreForm({ ...storeForm, form20bExpiry: e.target.value })}
                    className="input input-sm w-full text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Form 21B No. (Wholesale Sch C/C1)
                  </label>
                  <input
                    type="text"
                    value={storeForm.form21bNo || ""}
                    onChange={(e) => setStoreForm({ ...storeForm, form21bNo: e.target.value })}
                    placeholder="e.g. 21B-DL-6789"
                    className="input input-sm w-full font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Form 21B Expiry Date
                  </label>
                  <input
                    type="date"
                    value={storeForm.form21bExpiry || ""}
                    onChange={(e) => setStoreForm({ ...storeForm, form21bExpiry: e.target.value })}
                    className="input input-sm w-full text-xs"
                  />
                </div>
              </div>

              {/* FSSAI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    FSSAI Registration No.
                  </label>
                  <input
                    type="text"
                    value={storeForm.fssaiNo || ""}
                    onChange={(e) => setStoreForm({ ...storeForm, fssaiNo: e.target.value })}
                    placeholder="14-digit FSSAI number"
                    className="input input-sm w-full font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    FSSAI Expiry Date
                  </label>
                  <input
                    type="date"
                    value={storeForm.fssaiExpiry || ""}
                    onChange={(e) => setStoreForm({ ...storeForm, fssaiExpiry: e.target.value })}
                    className="input input-sm w-full text-xs"
                  />
                </div>
              </div>

              {/* Chief Pharmacist */}
              <div className="p-3 rounded-lg border border-zinc-200 bg-zinc-50/50">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Designated Chief Pharmacist (Qualified Person)
                </label>
                <select
                  value={storeForm.chiefPharmacistId || ""}
                  onChange={(e) => setStoreForm({ ...storeForm, chiefPharmacistId: e.target.value })}
                  className="input input-sm w-full text-xs"
                >
                  <option value="">-- No Chief Pharmacist Designated --</option>
                  {pharmacistOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name} ({opt.email}) {opt.regNo ? `- Reg: ${opt.regNo}` : "- Reg pending"}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Drug Inspectors mandate display of Qualified Person name & council registration number on inspection board.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setSelectedStore(null)}
                  className="btn btn-secondary btn-sm"
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={isPending}
                >
                  {isPending ? "Saving..." : "Save License Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Update Pharmacist Council Credentials */}
      {selectedPharmacist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  Update Council Registration: {selectedPharmacist.name}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">{selectedPharmacist.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPharmacist(null)}
                className="btn btn-ghost btn-icon text-zinc-400 hover:text-zinc-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSavePharmacist} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  State Pharmacy Council (e.g. Maharashtra, Delhi, Karnataka)
                </label>
                <input
                  type="text"
                  value={pharmForm.pharmacistCouncilState || ""}
                  onChange={(e) =>
                    setPharmForm({ ...pharmForm, pharmacistCouncilState: e.target.value })
                  }
                  placeholder="e.g. Maharashtra State Pharmacy Council"
                  className="input input-sm w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  State Council Registration Number
                </label>
                <input
                  type="text"
                  value={pharmForm.pharmacistRegNo || ""}
                  onChange={(e) =>
                    setPharmForm({ ...pharmForm, pharmacistRegNo: e.target.value })
                  }
                  placeholder="e.g. MSPC-123456"
                  className="input input-sm w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Registration Renewal Validity Expiry Date
                </label>
                <input
                  type="date"
                  value={pharmForm.pharmacistRegExpiry || ""}
                  onChange={(e) =>
                    setPharmForm({ ...pharmForm, pharmacistRegExpiry: e.target.value })
                  }
                  className="input input-sm w-full text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setSelectedPharmacist(null)}
                  className="btn btn-secondary btn-sm"
                  disabled={isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={isPending}
                >
                  {isPending ? "Saving..." : "Save Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
