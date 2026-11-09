"use client";

import { useState } from "react";
import {
  updateCustomerConsentAction,
  exportCustomerDataAction,
  anonymiseCustomerAction,
} from "@/app/actions/privacy";
import type { CustomerConsentStatus, ConsentPurpose } from "@/server/domain/privacy";
import {
  ShieldCheck,
  Download,
  AlertTriangle,
  History,
  Lock,
  CheckCircle2,
  XCircle,
  FileText,
  UserX,
  X,
  AlertCircle,
  Check,
} from "lucide-react";

interface CustomerData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
}

interface CustomerPrivacyClientProps {
  customer: CustomerData;
  initialConsents: CustomerConsentStatus;
}

export function CustomerPrivacyClient({
  customer,
  initialConsents,
}: CustomerPrivacyClientProps) {
  const [consents, setConsents] = useState(initialConsents);
  const [isUpdatingConsent, setIsUpdatingConsent] = useState(false);
  const [consentMsg, setConsentMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Export State
  const [isExporting, setIsExporting] = useState(false);

  // Erasure State
  const [isErasureModalOpen, setIsErasureModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [erasureReason, setErasureReason] = useState("");
  const [isErasing, setIsErasing] = useState(false);
  const [erasureError, setErasureError] = useState<string | null>(null);

  const isAnonymised = !customer.isActive && customer.name.includes("DPDP Erased");

  const handleToggleConsent = async (purpose: ConsentPurpose, currentValue: boolean) => {
    setIsUpdatingConsent(true);
    setConsentMsg(null);
    const nextValue = !currentValue;

    const res = await updateCustomerConsentAction(
      customer.id,
      purpose,
      nextValue,
      `Toggled to ${nextValue ? "granted" : "revoked"} via Privacy Console`
    );

    if (res.error) {
      setConsentMsg({ type: "error", text: res.error });
    } else {
      setConsents((prev) => ({
        ...prev,
        [purpose]: nextValue,
        history: [
          {
            id: `temp_${Date.now()}`,
            purpose,
            granted: nextValue,
            source: "privacy_portal",
            notes: `Toggled via console`,
            createdAt: new Date(),
          },
          ...prev.history,
        ],
      }));
      setConsentMsg({
        type: "success",
        text: `Consent for ${purpose} updated to ${nextValue ? "Granted" : "Revoked"}.`,
      });
      setTimeout(() => setConsentMsg(null), 3000);
    }
    setIsUpdatingConsent(false);
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const res = await exportCustomerDataAction(customer.id);
      if (res.success && res.data) {
        const jsonStr = JSON.stringify(res.data, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `patient_data_${customer.id}_dpdp.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert(res.error || "Failed to export data");
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleExecuteErasure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText !== "CONFIRM ERASURE") {
      setErasureError("Type 'CONFIRM ERASURE' in uppercase to confirm.");
      return;
    }

    setIsErasing(true);
    setErasureError(null);

    const res = await anonymiseCustomerAction(customer.id, confirmText, erasureReason);
    if ("error" in res && res.error) {
      setErasureError(res.error);
      setIsErasing(false);
    } else {
      setIsErasureModalOpen(false);
      window.location.reload();
    }
  };

  return (
    <div className="space-y-6">
      {/* Statutory Harmonization Alert */}
      <div className="p-4 rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50 dark:bg-sky-950/30 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <span className="font-semibold text-sky-900 dark:text-sky-200 block">
            Digital Personal Data Protection Act, 2023 (DPDP) Compliance
          </span>
          <p className="text-sky-700 dark:text-sky-300 leading-relaxed">
            Personal health and contact data is managed strictly in accordance with DPDP principles. Under Section 12(3) of the Act, statutory records (including GST tax invoices under Section 36 of CGST Act and Schedule H prescription logs under Rule 65 of Drugs and Cosmetics Rules 1945) are preserved for statutory inspection, while personal identifiers can be erased upon patient request.
          </p>
        </div>
      </div>

      {consentMsg && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            consentMsg.type === "success" ? "alert-success" : "alert-error"
          }`}
        >
          {consentMsg.type === "success" ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {consentMsg.text}
        </div>
      )}

      {/* Patient Profile & Status Card */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-ink-900 dark:text-ink-100">{customer.name}</h2>
              {isAnonymised ? (
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                  DPDP Erased
                </span>
              ) : (
                <span className="badge badge-success !text-[11px]">Active Profile</span>
              )}
            </div>
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-1">
              Registered on {new Date(customer.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              {customer.phone && ` · Contact: ${customer.phone}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportData}
              disabled={isExporting}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              {isExporting ? "Exporting…" : "Export Data (JSON)"}
            </button>
          </div>
        </div>
      </div>

      {/* Consent Management Matrix */}
      <div className="card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary-500" />
            Purpose-Specific Consent Matrix
          </h3>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
            Patients can independently grant or revoke consent for distinct communication and processing channels.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          {/* 1. Transactional */}
          <div className="p-4 rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-900 dark:text-ink-100">
                  Transactional Invoices
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                    consents.transactional
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-ink-100 text-ink-600 dark:bg-ink-800"
                  }`}
                >
                  {consents.transactional ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" /> Granted
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3" /> Opted Out
                    </>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-2 leading-relaxed">
                Legitimate dispatch of statutory sales receipts and digital tax invoices via WhatsApp or SMS.
              </p>
            </div>

            <button
              type="button"
              disabled={isUpdatingConsent || isAnonymised}
              onClick={() => handleToggleConsent("transactional", consents.transactional)}
              className="btn btn-secondary text-xs w-full justify-center"
            >
              {consents.transactional ? "Revoke Consent" : "Grant Consent"}
            </button>
          </div>

          {/* 2. Reminders */}
          <div className="p-4 rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-900 dark:text-ink-100">
                  Refill &amp; Health Reminders
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                    consents.reminders
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  }`}
                >
                  {consents.reminders ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" /> Granted
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3" /> Denied / Revoked
                    </>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-2 leading-relaxed">
                Automated refill alerts for chronic medications, dosage schedules, and health follow-ups.
              </p>
            </div>

            <button
              type="button"
              disabled={isUpdatingConsent || isAnonymised}
              onClick={() => handleToggleConsent("reminders", consents.reminders)}
              className="btn btn-secondary text-xs w-full justify-center"
            >
              {consents.reminders ? "Revoke Consent" : "Grant Consent"}
            </button>
          </div>

          {/* 3. Marketing */}
          <div className="p-4 rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink-900 dark:text-ink-100">
                  Promotions &amp; Offers
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                    consents.marketing
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-ink-100 text-ink-600 dark:bg-ink-800"
                  }`}
                >
                  {consents.marketing ? (
                    <>
                      <CheckCircle2 className="h-3 w-3" /> Granted
                    </>
                  ) : (
                    <>
                      <XCircle className="h-3 w-3" /> Denied / Revoked
                    </>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-ink-500 dark:text-ink-400 mt-2 leading-relaxed">
                Seasonal health camps, wellness newsletters, and pharmacy retail promotional offers.
              </p>
            </div>

            <button
              type="button"
              disabled={isUpdatingConsent || isAnonymised}
              onClick={() => handleToggleConsent("marketing", consents.marketing)}
              className="btn btn-secondary text-xs w-full justify-center"
            >
              {consents.marketing ? "Revoke Consent" : "Grant Consent"}
            </button>
          </div>
        </div>
      </div>

      {/* Consent History Timeline */}
      <div className="card p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100 flex items-center gap-2">
            <History className="h-4 w-4 text-primary-500" />
            Consent Audit Log
          </h3>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
            Immutable audit record of patient consent captures, modifications, and channels.
          </p>
        </div>

        {consents.history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-ink-150 dark:border-ink-800 text-ink-500 dark:text-ink-400">
                  <th className="py-2.5 font-medium">Timestamp</th>
                  <th className="py-2.5 font-medium">Purpose</th>
                  <th className="py-2.5 font-medium">Status</th>
                  <th className="py-2.5 font-medium">Channel / Source</th>
                  <th className="py-2.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {consents.history.map((h) => (
                  <tr key={h.id} className="text-ink-800 dark:text-ink-200">
                    <td className="py-2.5 num font-mono text-[11px]">
                      {new Date(h.createdAt).toLocaleString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 capitalize font-medium">{h.purpose}</td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          h.granted
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-950/40"
                        }`}
                      >
                        {h.granted ? "Granted" : "Revoked"}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono uppercase text-[10px]">{h.source}</td>
                    <td className="py-2.5 text-ink-500 dark:text-ink-400 max-w-xs truncate">
                      {h.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-ink-400 py-3 text-center">No previous consent records found.</p>
        )}
      </div>

      {/* Statutory Erasure / Anonymisation Card */}
      <div className="card p-6 border-rose-200 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10 space-y-4">
        <div className="flex items-start gap-3">
          <UserX className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
              Data Principal Right to Erasure (DPDP Act Section 12)
            </h3>
            <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
              When a patient requests data erasure, their personal identifiers (name, phone, email, address) will be permanently redacted. Historical sales records, tax invoices, and prescription batch records are legally preserved per Section 36 of CGST Act and Rule 65 of Drugs and Cosmetics Rules 1945.
            </p>
          </div>
        </div>

        {isAnonymised ? (
          <div className="p-3 bg-ink-100 dark:bg-ink-800 rounded-lg text-xs font-mono text-ink-700 dark:text-ink-300 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            This patient profile has been anonymised. Personal data has been erased and communications stopped.
          </div>
        ) : (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setIsErasureModalOpen(true)}
              className="btn btn-secondary text-xs text-rose-600 hover:text-rose-700 border-rose-200 dark:border-rose-800"
            >
              Request Data Erasure &amp; Anonymisation
            </button>
          </div>
        )}
      </div>

      {/* Erasure Confirmation Modal */}
      {isErasureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-ink-900 rounded-xl shadow-xl max-w-lg w-full border border-ink-200 dark:border-ink-800 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-150 dark:border-ink-800">
              <h3 className="text-sm font-semibold text-rose-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Confirm Statutory Erasure (DPDP Section 12)
              </h3>
              <button
                type="button"
                onClick={() => setIsErasureModalOpen(false)}
                className="text-ink-400 hover:text-ink-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteErasure} className="p-6 space-y-4">
              {erasureError && (
                <div className="alert-error text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {erasureError}
                </div>
              )}

              <p className="text-xs text-ink-600 dark:text-ink-300 leading-relaxed">
                This will irreversibly anonymise patient <strong>{customer.name}</strong>. Their phone, email, address, and notes will be wiped. All outbound reminders and communications will be cancelled. Statutory financial and drug registers will be retained in accordance with Indian pharmacy regulations.
              </p>

              <div>
                <label className="text-xs font-medium text-ink-700 dark:text-ink-300 block mb-1">
                  Reason for Request (Optional)
                </label>
                <input
                  value={erasureReason}
                  onChange={(e) => setErasureReason(e.target.value)}
                  placeholder="e.g. Patient requested erasure via phone or written notice"
                  className="input text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-ink-700 dark:text-ink-300 block mb-1">
                  Type <span className="font-mono font-bold text-rose-600">CONFIRM ERASURE</span> to proceed:
                </label>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="CONFIRM ERASURE"
                  className="input font-mono text-xs uppercase"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-ink-150 dark:border-ink-800">
                <button
                  type="button"
                  onClick={() => setIsErasureModalOpen(false)}
                  className="btn btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isErasing || confirmText !== "CONFIRM ERASURE"}
                  className="btn btn-primary text-xs !bg-rose-600 hover:!bg-rose-700 !border-rose-600 text-white"
                >
                  {isErasing ? "Anonymising…" : "Permanently Anonymise"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

