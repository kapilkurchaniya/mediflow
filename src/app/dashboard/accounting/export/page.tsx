"use client";

import React, { useState } from "react";
import { Calculator, Download, FileSpreadsheet, RefreshCw, Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { getCaMonthEndPackAction } from "@/app/actions/audit-packs";
import type { CaMonthEndPackResult } from "@/server/domain/reports/ca-pack";

export default function CaExportPage() {
  const currentMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CaMonthEndPackResult | null>(null);
  const [salesCsv, setSalesCsv] = useState<string | null>(null);
  const [purchasesCsv, setPurchasesCsv] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getCaMonthEndPackAction({ monthString: selectedMonth });
      if (!res.success || !res.data) {
        setError(res.error || "Failed to compile CA Month-End pack");
        return;
      }
      setData(res.data);
      setSalesCsv(res.salesCsv || null);
      setPurchasesCsv(res.purchasesCsv || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error compiling CA pack");
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toRs = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold shadow-sm">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Chartered Accountant Month-End Pack
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              GSTR-1 JSON (GSTN Offline Tool), Inward ITC Register, Outward Sales, and Closing Stock Valuation.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 flex items-center gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Control Bar */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5">
            Audit Calendar Month
          </label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-sm"
          />
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all disabled:opacity-50"
        >
          {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
          <span>{loading ? "Compiling Month-End Pack..." : "Compile CA Month-End Pack"}</span>
        </button>

        {data && (
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                downloadFile(
                  JSON.stringify(data.gstr1JsonPayload, null, 2),
                  `GSTR1_${selectedMonth}_${data.tenant.gstin || "PORTAL"}.json`,
                  "application/json",
                )
              }
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100"
            >
              <Download className="w-3.5 h-3.5" />
              <span>GSTR-1 JSON</span>
            </button>

            {salesCsv && (
              <button
                onClick={() => downloadFile(salesCsv, `Sales_Register_${selectedMonth}.csv`, "text/csv;charset=utf-8;")}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Sales CSV</span>
              </button>
            )}

            {purchasesCsv && (
              <button
                onClick={() => downloadFile(purchasesCsv, `Purchase_ITC_Register_${selectedMonth}.csv`, "text/csv;charset=utf-8;")}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold hover:bg-emerald-100"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Purchase/ITC CSV</span>
              </button>
            )}
          </div>
        )}
      </div>

      {data && (
        <div className="space-y-6">
          {/* Key Totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outward Sales Taxable</span>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                {toRs(data.gstr1Summary.totalB2bTaxablePaise + data.gstr1Summary.totalB2cTaxablePaise)}
              </p>
              <span className="text-[11px] text-slate-500 font-medium">B2B: {data.gstr1Summary.b2bCount} &bull; B2C: {data.gstr1Summary.b2cCount}</span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Output GST (GSTR-1)</span>
              <p className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                {toRs(data.gstr1Summary.totalTaxPaise)}
              </p>
              <span className="text-[11px] text-slate-500 font-medium">{data.gstr1Summary.hsnCount} HSN Groups</span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Inward Purchases</span>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                {toRs(data.purchases.reduce((acc, p) => acc + p.totalPaise, 0))}
              </p>
              <span className="text-[11px] text-emerald-600 font-medium">{data.purchases.filter((p) => p.itcEligible).length} Eligible Invoices</span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Closing Stock (Cost vs MRP)</span>
              <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
                {toRs(data.stockValuation.valuationAtCostPaise)}
              </p>
              <span className="text-[11px] text-slate-500 font-medium">MRP: {toRs(data.stockValuation.valuationAtMrpPaise)}</span>
            </div>
          </div>

          {/* Double-Entry Financial Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Trial Balance Summary</h3>
              <div className="flex justify-between text-xs py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">Total Debits</span>
                <span className="font-mono font-bold">{toRs(data.trialBalance.totalDebitPaise)}</span>
              </div>
              <div className="flex justify-between text-xs py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">Total Credits</span>
                <span className="font-mono font-bold">{toRs(data.trialBalance.totalCreditPaise)}</span>
              </div>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium pt-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ledger in balance for period {data.month}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Profit & Loss Snapshot</h3>
              <div className="flex justify-between text-xs py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">Total Operating Revenue</span>
                <span className="font-mono font-bold">{toRs(data.profitAndLoss.revenuePaise)}</span>
              </div>
              <div className="flex justify-between text-xs py-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-400">Cost of Goods Sold (COGS)</span>
                <span className="font-mono font-bold">{toRs(data.profitAndLoss.cogsPaise)}</span>
              </div>
              <div className="flex justify-between text-xs py-2 font-bold text-slate-900 dark:text-white">
                <span>Net Margin</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">{toRs(data.profitAndLoss.netProfitPaise)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

