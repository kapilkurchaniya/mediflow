 "use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Percent,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  ShieldCheck,
  Search,
} from "lucide-react";
import { PageHeader, StatCard } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { previewGstRerate, bulkUpdateGstRates } from "@/app/actions/gst";
import { GST_RATES_BP, formatGstRate } from "@/lib/regulatory";

interface RateDistributionItem {
  gstRateBp: number;
  count: number;
}

export function RerateClient({
  initialDistribution,
}: {
  initialDistribution: RateDistributionItem[];
}) {
  const [fromRateBp, setFromRateBp] = useState<number>(1200); // 12% pre-GST 2.0 default
  const [toRateBp, setToRateBp] = useState<number>(500); // 5% GST 2.0 standard
  const [hsnOption, setHsnOption] = useState<string>("3004");
  const [customHsn, setCustomHsn] = useState<string>("");
  const [reason, setReason] = useState<string>("GST 2.0 Notification Medicine Rate Rationalisation (HSN 3004)");

  const [isPreviewing, startPreviewTransition] = useTransition();
  const [isUpdating, startUpdateTransition] = useTransition();

  const [previewData, setPreviewData] = useState<{
    count: number;
    sample: Array<{ id: string; name: string; hsn: string | null; mrp: number; gstRateBp: number }>;
  } | null>(null);

  const [actionResult, setActionResult] = useState<{ success?: boolean; count?: number; error?: string } | null>(
    null
  );

  const effectiveHsn = hsnOption === "custom" ? customHsn : hsnOption === "all" ? undefined : hsnOption;

  const handlePreview = () => {
    setActionResult(null);
    startPreviewTransition(async () => {
      const res = await previewGstRerate({
        fromRateBp,
        hsnPrefix: effectiveHsn || undefined,
      });
      setPreviewData(res);
    });
  };

  const handleApply = () => {
    if (!previewData || previewData.count === 0) return;
    startUpdateTransition(async () => {
      const res = await bulkUpdateGstRates({
        fromRateBp,
        toRateBp,
        hsnPrefix: effectiveHsn || undefined,
        reason,
      });
      setActionResult(res);
      if (res.success) {
        setPreviewData(null);
      }
    });
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageHeader
        eyebrow="GST 2.0 Transition • Tax Management"
        title="Catalogue GST Re-Rate Tool"
        description="Bulk update master catalogue GST rates (e.g. 12% → 5% under GST 2.0 for HSN 3004) with audit logging. Historical sale invoices and purchases are preserved unchanged."
        actions={
          <Link href="/dashboard/gst" className="btn btn-secondary text-sm flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back to GST
          </Link>
        }
      />

      {/* Distribution Overview */}
      <div className="card p-5">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-500 mb-3 flex items-center gap-1.5">
          <Percent className="w-3.5 h-3.5 text-brand-600" /> Current Catalogue Distribution by GST Rate
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {GST_RATES_BP.map((bp) => {
            const item = initialDistribution.find((d) => d.gstRateBp === bp);
            const count = item?.count ?? 0;
            const isPreGstPharma = bp === 1200;
            return (
              <div
                key={bp}
                className={`p-3 rounded-xl border text-center transition-all ${
                  isPreGstPharma && count > 0
                    ? "bg-amber-50/60 border-amber-300 ring-1 ring-amber-200"
                    : "bg-surface-50 border-ink-150"
                }`}
              >
                <div className="text-xs font-semibold text-ink-600">{formatGstRate(bp)} GST</div>
                <div className="text-xl font-extrabold text-ink-950 font-mono mt-0.5">{count}</div>
                <div className="text-[10px] text-ink-500 mt-0.5">
                  {isPreGstPharma && count > 0 ? "Requires re-rating" : "medicines"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Success Alert */}
      {actionResult?.success && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 flex items-start gap-3 shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-sm">Successfully Re-Rated {actionResult.count} Medicines</h3>
            <p className="text-xs text-emerald-800 mt-0.5">
              Updated GST rate from {formatGstRate(fromRateBp)} to {formatGstRate(toRateBp)}. An official audit log row
              has been recorded with action <code className="font-mono text-emerald-900">medicine.gst_rerate</code>.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Link href="/dashboard/inventory" className="btn btn-sm btn-primary">
                View Inventory Master
              </Link>
              <button
                onClick={() => setActionResult(null)}
                className="btn btn-sm btn-ghost text-emerald-800 hover:bg-emerald-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {actionResult?.error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-950 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-sm">Re-Rate Failed</h3>
            <p className="text-xs text-rose-800 mt-0.5">{actionResult.error}</p>
          </div>
        </div>
      )}

      {/* Re-Rate Form */}
      <div className="card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold text-ink-700 uppercase tracking-wide mb-2">
              Current GST Rate (Source)
            </label>
            <select
              value={fromRateBp}
              onChange={(e) => {
                setFromRateBp(Number(e.target.value));
                setPreviewData(null);
              }}
              className="input w-full font-medium"
            >
              {GST_RATES_BP.map((bp) => (
                <option key={bp} value={bp}>
                  {formatGstRate(bp)} ({bp} Basis Points) {bp === 1200 ? "— Legacy Pharma Rate" : ""}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-500 mt-1">Select the existing rate you wish to migrate from.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-ink-700 uppercase tracking-wide mb-2">
              New GST Rate (Target)
            </label>
            <select
              value={toRateBp}
              onChange={(e) => {
                setToRateBp(Number(e.target.value));
                setPreviewData(null);
              }}
              className="input w-full font-medium"
            >
              {GST_RATES_BP.map((bp) => (
                <option key={bp} value={bp}>
                  {formatGstRate(bp)} ({bp} Basis Points) {bp === 500 ? "— GST 2.0 Standard" : ""}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-500 mt-1">The new statutory rate to apply to the master catalogue.</p>
          </div>
        </div>

        {/* HSN Prefix Filter */}
        <div className="space-y-3 pt-4 border-t border-ink-150">
          <label className="block text-xs font-bold text-ink-700 uppercase tracking-wide">
            HSN Prefix Filter
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => {
                setHsnOption("3004");
                setPreviewData(null);
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                hsnOption === "3004"
                  ? "bg-brand-50/70 border-brand-500 ring-2 ring-brand-200"
                  : "bg-surface-50 border-ink-200 hover:bg-surface-100"
              }`}
            >
              <div className="text-xs font-bold text-ink-900">HSN 3004 Prefix</div>
              <div className="text-[11px] text-ink-600 mt-0.5">Formulations & Retail Medicines</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setHsnOption("3003");
                setPreviewData(null);
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                hsnOption === "3003"
                  ? "bg-brand-50/70 border-brand-500 ring-2 ring-brand-200"
                  : "bg-surface-50 border-ink-200 hover:bg-surface-100"
              }`}
            >
              <div className="text-xs font-bold text-ink-900">HSN 3003 Prefix</div>
              <div className="text-[11px] text-ink-600 mt-0.5">Bulk / Unpackaged Formulations</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setHsnOption("all");
                setPreviewData(null);
              }}
              className={`p-3 rounded-xl border text-left transition-all ${
                hsnOption === "all"
                  ? "bg-brand-50/70 border-brand-500 ring-2 ring-brand-200"
                  : "bg-surface-50 border-ink-200 hover:bg-surface-100"
              }`}
            >
              <div className="text-xs font-bold text-ink-900">All HSN Codes</div>
              <div className="text-[11px] text-ink-600 mt-0.5">All items with matching rate</div>
            </button>
          </div>
        </div>

        {/* Reason / Regulatory Reference */}
        <div className="space-y-1.5 pt-4 border-t border-ink-150">
          <label className="block text-xs font-bold text-ink-700 uppercase tracking-wide">
            Audit Reason / Regulatory Reference
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="input w-full text-xs font-medium"
            placeholder="e.g. CBIC Notification No. 01/2026 - GST 2.0 Medicine Rate Revision"
          />
          <p className="text-[11px] text-ink-500">
            Recorded in the permanent audit trail (<code className="font-mono">audit_logs</code>) for tax inspectors and auditors.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-ink-150">
          <button
            type="button"
            onClick={handlePreview}
            disabled={isPreviewing || fromRateBp === toRateBp}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {isPreviewing ? "Scanning Catalogue..." : "Preview Affected Items"}
          </button>

          {previewData && previewData.count > 0 && (
            <button
              type="button"
              onClick={handleApply}
              disabled={isUpdating}
              className="btn btn-primary flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isUpdating ? "animate-spin" : ""}`} />
              {isUpdating
                ? "Applying Re-Rate..."
                : `Apply ${formatGstRate(toRateBp)} Rate to ${previewData.count} Medicines`}
            </button>
          )}
        </div>
      </div>

      {/* Preview Result Card */}
      {previewData && (
        <div className="card p-6 border-brand-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileCheck2 className="w-5 h-5 text-brand-600" />
              <h2 className="text-sm font-bold text-ink-900">
                Preview: {previewData.count} Medicines Matched
              </h2>
            </div>
            <span className="badge badge-primary font-mono text-xs">
              {formatGstRate(fromRateBp)} → {formatGstRate(toRateBp)}
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-surface-50 border border-ink-150 text-xs text-ink-700 space-y-1">
            <div className="font-semibold text-ink-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Audit & Accounting Integrity Notice
            </div>
            <p>
              Executing this action will update the master catalogue rate for all {previewData.count} matching medicines.
              Historical sale items and purchase items will strictly preserve their original billed tax rates.
            </p>
          </div>

          {previewData.sample.length > 0 && (
            <div className="overflow-x-auto">
              <table className="data-table text-xs">
                <thead>
                  <tr>
                    <th>Medicine Name</th>
                    <th>HSN</th>
                    <th>Current MRP</th>
                    <th>Current Rate</th>
                    <th>New Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.sample.map((m) => (
                    <tr key={m.id}>
                      <td className="font-medium text-ink-900">{m.name}</td>
                      <td className="font-mono text-ink-600">{m.hsn || "—"}</td>
                      <td className="font-mono">{formatINR(m.mrp)}</td>
                      <td>
                        <span className="badge badge-neutral font-mono">{formatGstRate(m.gstRateBp)}</span>
                      </td>
                      <td>
                        <span className="badge badge-success font-mono font-bold">
                          {formatGstRate(toRateBp)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewData.count > previewData.sample.length && (
                <p className="text-[11px] text-ink-500 italic mt-2 text-center">
                  Showing {previewData.sample.length} of {previewData.count} matching medicines
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
