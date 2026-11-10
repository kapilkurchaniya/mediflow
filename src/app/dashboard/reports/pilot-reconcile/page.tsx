"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Scale,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Download,
  Calendar,
  Building2,
  RefreshCw,
  Info,
} from "lucide-react";
import { reconcileDailyReportAction, exportReconciliationCsvAction } from "@/app/actions/pilot";
import { type DailyReconciliationResult, type LegacyDailyReportInput } from "@/server/domain/pilot/reconciliation";

export default function PilotReconcilePage() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const [legacySystem, setLegacySystem] = useState<LegacyDailyReportInput["legacySystem"]>("MARG");
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<DailyReconciliationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    grossSalesRs: "10500.00",
    taxableAmountRs: "10000.00",
    cgstRs: "250.00",
    sgstRs: "250.00",
    netSalesRs: "10500.00",
    cashCollectedRs: "6500.00",
    digitalCollectedRs: "4000.00",
    creditSalesRs: "0.00",
    totalBillsCount: "12",
    cancelledBillsCount: "0",
  });

  const handleRunReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRunning(true);
    setError(null);

    const toPaise = (val: string) => Math.round(parseFloat(val || "0") * 100);

    const payload: LegacyDailyReportInput = {
      date,
      storeId: "", // Resolved to active store by server action
      legacySystem,
      grossSalesPaise: toPaise(form.grossSalesRs),
      taxableAmountPaise: toPaise(form.taxableAmountRs),
      cgstPaise: toPaise(form.cgstRs),
      sgstPaise: toPaise(form.sgstRs),
      totalTaxPaise: toPaise(form.cgstRs) + toPaise(form.sgstRs),
      netSalesPaise: toPaise(form.netSalesRs),
      cashCollectedPaise: toPaise(form.cashCollectedRs),
      digitalCollectedPaise: toPaise(form.digitalCollectedRs),
      creditSalesPaise: toPaise(form.creditSalesRs),
      totalBillsCount: parseInt(form.totalBillsCount || "0", 10),
      cancelledBillsCount: parseInt(form.cancelledBillsCount || "0", 10),
    };

    const res = await reconcileDailyReportAction(payload);
    setIsRunning(false);

    if (!res.success || !res.data) {
      setError(res.error ?? "Failed to run reconciliation.");
      return;
    }

    setResult(res.data);
  };

  const handleDownloadCsv = async () => {
    if (!result) return;
    const res = await exportReconciliationCsvAction(result);
    if (!res.success || !res.csv) return;

    const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = res.filename ?? `reconcile-${date}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const inRs = (paise: number) => (paise / 100).toFixed(2);

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink-150 pb-5">
        <div>
          <Link
            href="/dashboard/reports"
            className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1 mb-1"
          >
            <ArrowLeft className="h-3 w-3" /> Back to Reports
          </Link>
          <h1 className="text-xl font-bold text-ink-900 tracking-tight flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary-600" />
            Pilot Daily ERP Reconciliation
          </h1>
          <p className="text-xs text-ink-500 mt-1">
            Compare MediFlow against Marg ERP / Vyapar daybook totals to verify financial parity.
          </p>
        </div>

        {result && (
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download CSV Summary</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Parameters Form */}
        <form onSubmit={handleRunReconcile} className="lg:col-span-1 rounded-xl border border-ink-150 bg-white p-5 space-y-4 shadow-2xs">
          <h3 className="text-sm font-bold text-ink-900 flex items-center gap-1.5 border-b border-ink-100 pb-2">
            <Calendar className="h-4 w-4 text-ink-500" />
            Enter Legacy Daybook Totals
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-medium text-ink-600 mb-1">Reconciliation Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-ink-200 px-3 py-1.5 text-xs text-ink-900"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-ink-600 mb-1">Legacy System</label>
              <select
                value={legacySystem}
                onChange={(e) => setLegacySystem(e.target.value as LegacyDailyReportInput["legacySystem"])}
                className="w-full rounded-lg border border-ink-200 px-3 py-1.5 text-xs text-ink-900"
              >
                <option value="MARG">Marg ERP 9+ (Daily Z-Report)</option>
                <option value="VYAPAR">Vyapar App</option>
                <option value="BUSY">Busy Accounting</option>
                <option value="MANUAL">Manual Register</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-ink-600 mb-1">Net Sales (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.netSalesRs}
                  onChange={(e) => setForm({ ...form, netSalesRs: e.target.value })}
                  className="w-full rounded-lg border border-ink-200 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-600 mb-1">Taxable (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.taxableAmountRs}
                  onChange={(e) => setForm({ ...form, taxableAmountRs: e.target.value })}
                  className="w-full rounded-lg border border-ink-200 px-2 py-1 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-ink-600 mb-1">CGST (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.cgstRs}
                  onChange={(e) => setForm({ ...form, cgstRs: e.target.value })}
                  className="w-full rounded-lg border border-ink-200 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-600 mb-1">SGST (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.sgstRs}
                  onChange={(e) => setForm({ ...form, sgstRs: e.target.value })}
                  className="w-full rounded-lg border border-ink-200 px-2 py-1 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-ink-600 mb-1">Cash Tender (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.cashCollectedRs}
                  onChange={(e) => setForm({ ...form, cashCollectedRs: e.target.value })}
                  className="w-full rounded-lg border border-ink-200 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-600 mb-1">UPI / Digital (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.digitalCollectedRs}
                  onChange={(e) => setForm({ ...form, digitalCollectedRs: e.target.value })}
                  className="w-full rounded-lg border border-ink-200 px-2 py-1 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-ink-600 mb-1">Bill Count</label>
                <input
                  type="number"
                  value={form.totalBillsCount}
                  onChange={(e) => setForm({ ...form, totalBillsCount: e.target.value })}
                  className="w-full rounded-lg border border-ink-200 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-ink-600 mb-1">Cancelled</label>
                <input
                  type="number"
                  value={form.cancelledBillsCount}
                  onChange={(e) => setForm({ ...form, cancelledBillsCount: e.target.value })}
                  className="w-full rounded-lg border border-ink-200 px-2 py-1 text-xs"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isRunning}
            className="w-full btn btn-primary btn-sm flex items-center justify-center gap-1.5 mt-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? "animate-spin" : ""}`} />
            <span>{isRunning ? "Calculating..." : "Run Reconciliation"}</span>
          </button>
        </form>

        {/* Results Pane */}
        <div className="lg:col-span-2 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!result && !error && (
            <div className="rounded-xl border border-dashed border-ink-200 bg-white p-12 text-center space-y-2">
              <Scale className="mx-auto h-8 w-8 text-ink-300" />
              <h4 className="text-sm font-semibold text-ink-800">Ready to Reconcile</h4>
              <p className="text-xs text-ink-500 max-w-sm mx-auto">
                Enter your Marg ERP daily Z-report numbers on the left and click &quot;Run Reconciliation&quot; to inspect any variance.
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              {/* Status Header */}
              <div className={`rounded-xl border p-4 flex items-center justify-between ${
                result.status === "MATCH"
                  ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
                  : result.status === "TOLERABLE_ROUNDING"
                  ? "border-amber-200 bg-amber-50/80 text-amber-900"
                  : "border-rose-200 bg-rose-50/80 text-rose-900"
              }`}>
                <div className="flex items-center gap-2.5">
                  {result.status === "MATCH" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  )}
                  <div>
                    <h4 className="text-sm font-bold">
                      Status: {result.status}
                    </h4>
                    <p className="text-xs mt-0.5">{result.summaryNote}</p>
                  </div>
                </div>
              </div>

              {/* Side by Side Comparison Table */}
              <div className="rounded-xl border border-ink-150 bg-white overflow-hidden shadow-2xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-ink-50 border-b border-ink-150 text-[11px] font-semibold text-ink-700 uppercase">
                    <tr>
                      <th className="py-2.5 px-4">Financial Metric</th>
                      <th className="py-2.5 px-4 text-right">MediFlow</th>
                      <th className="py-2.5 px-4 text-right">Legacy ({result.legacySystem})</th>
                      <th className="py-2.5 px-4 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {[
                      { label: "Net Sales", mf: inRs(result.mediFlowTotals.netSalesPaise), leg: inRs(result.legacyTotals.netSalesPaise), delta: inRs(result.deltas.netSalesPaise) },
                      { label: "Taxable Value", mf: inRs(result.mediFlowTotals.taxableAmountPaise), leg: inRs(result.legacyTotals.taxableAmountPaise), delta: inRs(result.deltas.taxableAmountPaise) },
                      { label: "CGST", mf: inRs(result.mediFlowTotals.cgstPaise), leg: inRs(result.legacyTotals.cgstPaise), delta: inRs(result.deltas.cgstPaise) },
                      { label: "SGST", mf: inRs(result.mediFlowTotals.sgstPaise), leg: inRs(result.legacyTotals.sgstPaise), delta: inRs(result.deltas.sgstPaise) },
                      { label: "Cash Tender", mf: inRs(result.mediFlowTotals.cashCollectedPaise), leg: inRs(result.legacyTotals.cashCollectedPaise), delta: inRs(result.deltas.cashCollectedPaise) },
                      { label: "Digital (UPI)", mf: inRs(result.mediFlowTotals.digitalCollectedPaise), leg: inRs(result.legacyTotals.digitalCollectedPaise), delta: inRs(result.deltas.digitalCollectedPaise) },
                      { label: "Bills Count", mf: String(result.mediFlowTotals.totalBillsCount), leg: String(result.legacyTotals.totalBillsCount), delta: String(result.deltas.totalBillsCount) },
                      { label: "Cancelled", mf: String(result.mediFlowTotals.cancelledBillsCount), leg: String(result.legacyTotals.cancelledBillsCount), delta: String(result.deltas.cancelledBillsCount) },
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-ink-25/50">
                        <td className="py-2 px-4 font-medium text-ink-900">{row.label}</td>
                        <td className="py-2 px-4 text-right text-ink-700">{row.mf}</td>
                        <td className="py-2 px-4 text-right text-ink-700">{row.leg}</td>
                        <td className={`py-2 px-4 text-right font-semibold ${
                          row.delta === "0.00" || row.delta === "0"
                            ? "text-emerald-600"
                            : "text-amber-600"
                        }`}>
                          {row.delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
