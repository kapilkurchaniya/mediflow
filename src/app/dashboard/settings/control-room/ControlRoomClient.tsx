"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Download, Shield, Sliders, History } from "lucide-react";
import type { StoreSettings } from "@/server/db/schema/platform";
import {
  exportTenantBackupJsonAction,
  updateControlRoomSettingsAction,
} from "@/app/actions/control-room";

interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string;
  createdAtIso: string;
}

export function ControlRoomClient({
  storeName,
  initialSettings,
  auditLogs,
}: {
  storeName: string;
  initialSettings: StoreSettings;
  auditLogs: AuditLogItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"controls" | "audit" | "backup">("controls");
  const [settings, setSettings] = useState<StoreSettings>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await updateControlRoomSettingsAction(settings);
      if (!res.success) {
        setMsg({ type: "err", text: res.error || "Failed to update settings" });
      } else {
        setMsg({ type: "ok", text: "Control Room settings saved & logged to audit trail." });
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleExportBackup() {
    setExporting(true);
    setMsg(null);
    try {
      const res = await exportTenantBackupJsonAction();
      if (!res.success || !res.backupJson) {
        setMsg({ type: "err", text: res.error || "Backup export failed" });
        return;
      }
      const blob = new Blob([res.backupJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MediFlow_Backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ type: "ok", text: "Full backup JSON downloaded (ready for Drive / local archive)." });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 border-b border-ink-200 pb-3">
        <button
          type="button"
          onClick={() => setTab("controls")}
          className={`btn btn-sm ${tab === "controls" ? "btn-primary" : "btn-ghost"}`}
        >
          <Sliders className="w-4 h-4" /> Store Policies & Controls
        </button>
        <button
          type="button"
          onClick={() => setTab("audit")}
          className={`btn btn-sm ${tab === "audit" ? "btn-primary" : "btn-ghost"}`}
        >
          <History className="w-4 h-4" /> MCA Audit Edit-Log ({auditLogs.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("backup")}
          className={`btn btn-sm ${tab === "backup" ? "btn-primary" : "btn-ghost"}`}
        >
          <Download className="w-4 h-4" /> Data Export & Backup
        </button>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center gap-2 ${
            msg.type === "ok"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {msg.type === "ok" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{msg.text}</span>
        </div>
      )}

      {tab === "controls" && (
        <form onSubmit={handleSave} className="card p-5 space-y-5">
          <div className="text-sm font-semibold text-ink-900">
            Active Store: {storeName}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="label">Negative Stock Policy</label>
              <select
                className="input"
                value={settings.negativeStockPolicy ?? "block"}
                onChange={(e) =>
                  setSettings({ ...settings, negativeStockPolicy: e.target.value as StoreSettings["negativeStockPolicy"] })
                }
              >
                <option value="block">Block (Strict — No Negative Stock)</option>
                <option value="warn">Warn (Allow with Going-Negative Indicator)</option>
                <option value="allow">Allow (Unrestricted)</option>
              </select>
            </div>

            <div>
              <label className="label">Below-Cost / Loss Billing Policy</label>
              <select
                className="input"
                value={settings.belowCostPolicy ?? "off"}
                onChange={(e) =>
                  setSettings({ ...settings, belowCostPolicy: e.target.value as StoreSettings["belowCostPolicy"] })
                }
              >
                <option value="off">Off</option>
                <option value="warn">Warn Only</option>
                <option value="block">Block Below-Cost Sales</option>
              </select>
            </div>

            <div>
              <label className="label">Print Bill Language (Regional)</label>
              <select
                className="input"
                value={settings.billLanguage ?? "en"}
                onChange={(e) =>
                  setSettings({ ...settings, billLanguage: e.target.value as StoreSettings["billLanguage"] })
                }
              >
                <option value="en">English (Default)</option>
                <option value="hi">Hindi (हिन्दी)</option>
                <option value="mr">Marathi (मराठी)</option>
                <option value="gu">Gujarati (ગુજરાતી)</option>
                <option value="ta">Tamil (தமிழ்)</option>
                <option value="bn">Bengali (বাংলা)</option>
              </select>
            </div>

            <div>
              <label className="label">Default Payment Method</label>
              <select
                className="input"
                value={settings.defaultPaymentMethod ?? "cash"}
                onChange={(e) =>
                  setSettings({ ...settings, defaultPaymentMethod: e.target.value as StoreSettings["defaultPaymentMethod"] })
                }
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI / QR</option>
                <option value="card">Card</option>
                <option value="credit">Credit</option>
              </select>
            </div>

            <div>
              <label className="label">Counter UPI VPA</label>
              <input
                type="text"
                className="input font-mono"
                placeholder="pharmacy@okicici"
                value={settings.upiVpa ?? ""}
                onChange={(e) => setSettings({ ...settings, upiVpa: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Keyboard Shortcut Preset (A19)</label>
              <select
                className="input"
                value={settings.shortcutPreset ?? "mediflow"}
                onChange={(e) =>
                  setSettings({ ...settings, shortcutPreset: e.target.value as StoreSettings["shortcutPreset"] })
                }
              >
                <option value="mediflow">MediFlow Default</option>
                <option value="marg">Marg Classic Preset</option>
              </select>
            </div>

            <div>
              <label className="label">Max Cashier Discount (%)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="100"
                className="input font-mono"
                value={((settings.maxDiscountBp ?? 1500) / 100).toString()}
                onChange={(e) =>
                  setSettings({ ...settings, maxDiscountBp: Math.round((parseFloat(e.target.value) || 0) * 100) })
                }
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-2">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(settings.requireShift)}
                onChange={(e) => setSettings({ ...settings, requireShift: e.target.checked })}
              />
              <span>Require open Cash Register Shift before POS billing</span>
            </label>

            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(settings.compositionSchemeEnabled)}
                onChange={(e) => setSettings({ ...settings, compositionSchemeEnabled: e.target.checked })}
              />
              <span>GST Composition Scheme Dealer (1% turnover tax, no ITC)</span>
            </label>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? "Saving..." : "Save Control Room Settings"}
            </button>
          </div>
        </form>
      )}

      {tab === "audit" && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-150 bg-ink-50/50 flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-semibold text-ink-900">Immutable MCA Rule 11(g) Audit Trail</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="p-3 text-left">Timestamp</th>
                  <th className="p-3 text-left">Action</th>
                  <th className="p-3 text-left">Entity</th>
                  <th className="p-3 text-left">Entity ID</th>
                  <th className="p-3 text-left">User ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="p-3 font-mono text-xs">{log.createdAtIso.replace("T", " ").slice(0, 19)}</td>
                    <td className="p-3 font-mono font-semibold text-ink-900">{log.action}</td>
                    <td className="p-3">{log.entityType}</td>
                    <td className="p-3 font-mono text-xs text-ink-500">{log.entityId}</td>
                    <td className="p-3 font-mono text-xs text-ink-500">{log.userId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "backup" && (
        <div className="card p-6 space-y-4">
          <h3 className="text-base font-semibold text-ink-900">Portable Tenant Data Backup</h3>
          <p className="text-sm text-ink-600">
            Download a complete JSON snapshot of your medicines, batches, customers, and suppliers for local archival or Google Drive backup.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleExportBackup} disabled={exporting} className="btn btn-primary">
              <Download className="w-4 h-4" /> {exporting ? "Preparing Backup..." : "Download Full Backup JSON"}
            </button>
            <button
              type="button"
              onClick={() => {
                const diag = {
                  generatedAt: new Date().toISOString(),
                  storeName,
                  userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
                  settings: {
                    ...settings,
                    upiVpa: settings.upiVpa ? "***redacted***" : undefined,
                  },
                  recentAuditCount: auditLogs.length,
                };
                const blob = new Blob([JSON.stringify(diag, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `MediFlow_Diagnostics_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="btn btn-secondary"
            >
              <Download className="w-4 h-4" /> Download Diagnostics Bundle (A11.10)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
