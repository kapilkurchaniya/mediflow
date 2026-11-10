"use client";

import React, { useState } from "react";
import { ShieldCheck, Download, Printer, Calendar, FileText, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { getDrugInspectorPackAction } from "@/app/actions/audit-packs";
import type { InspectorPackResult } from "@/server/domain/compliance/inspector-pack";

export default function DrugInspectorExportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InspectorPackResult | null>(null);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDrugInspectorPackAction({ startDate, endDate });
      if (!res.success || !res.data) {
        setError(res.error || "Failed to generate inspector pack");
        return;
      }
      setData(res.data);
      setCsvContent(res.h1Csv || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error generating pack");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!csvContent) return;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Schedule_H1_Register_${startDate}_to_${endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold shadow-sm">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Drug Inspector Compliance Pack
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              One-click statutory registers under Drugs and Cosmetics Rules 1945 (Schedule H, H1, X).
            </p>
          </div>
        </div>

        {data && (
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 text-slate-800 dark:text-slate-200 text-sm font-semibold shadow-sm"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Print Inspection Pack</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Controls */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Audit Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Audit End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
          <span>{loading ? "Compiling Registers..." : "Generate Inspector Pack"}</span>
        </button>

        {csvContent && (
          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Download Schedule H1 CSV</span>
          </button>
        )}
      </div>

      {/* Results View */}
      {data && (
        <div className="space-y-6">
          {/* Statutory Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Schedule H1 (Rule 65)</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{data.scheduleH1.length}</p>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">3-Year Mandatory Record</span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Schedule H Register</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{data.scheduleH.length}</p>
              <span className="text-[11px] text-slate-500 font-medium">Rx Dispensing Records</span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Inward Scheduled Bills</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{data.inwardScheduled.length}</p>
              <span className="text-[11px] text-slate-500 font-medium">Supplier DL Verified</span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pharmacists on Duty</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{data.pharmacists.length}</p>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Council Registered</span>
            </div>
          </div>

          {/* Schedule H1 Statutory Register Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  Schedule H1 Statutory Register (D&C Rules 1945 Form)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Prescriber doctor, patient address, medicine batch, and dispensing pharmacist registry.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Date / Time</th>
                    <th className="py-3 px-4">Patient Details</th>
                    <th className="py-3 px-4">Prescriber Doctor</th>
                    <th className="py-3 px-4">Formulation</th>
                    <th className="py-3 px-4">Batch & Expiry</th>
                    <th className="py-3 px-4 text-right">Qty Dispensed</th>
                    <th className="py-3 px-4">Pharmacist</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.scheduleH1.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        No Schedule H1 dispensing transactions recorded in selected date range.
                      </td>
                    </tr>
                  ) : (
                    data.scheduleH1.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-mono text-[11px] whitespace-nowrap">{row.dispensedAt}</td>
                        <td className="py-2.5 px-4">
                          <p className="font-semibold text-slate-900 dark:text-white">{row.patientName}</p>
                          <p className="text-[10px] text-slate-500">{row.patientAddress}</p>
                        </td>
                        <td className="py-2.5 px-4">
                          <p className="font-semibold">{row.doctorName}</p>
                          <p className="text-[10px] text-slate-500">Reg: {row.doctorRegNo}</p>
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white">{row.medicineName}</td>
                        <td className="py-2.5 px-4 font-mono text-[11px]">
                          <span>{row.batchNo}</span> &bull; <span className="text-slate-500">{row.expiryDate}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-white">
                          {row.quantityDispensed}
                        </td>
                        <td className="py-2.5 px-4">
                          <p className="font-medium">{row.pharmacistName}</p>
                          <p className="text-[10px] text-slate-500">Reg: {row.pharmacistRegNo}</p>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

