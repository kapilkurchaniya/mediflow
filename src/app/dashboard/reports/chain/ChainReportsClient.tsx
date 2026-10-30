"use client";

import React, { useState, useTransition } from "react";
import { ReportShell } from "@/app/components/ReportShell";
import { formatINR } from "@/lib/money";
import {
  TrendingUp,
  Boxes,
  AlertTriangle,
  Store,
  DollarSign,
  ArrowUpRight,
  PackageX,
  Building2,
  Calendar,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getChainOverviewReportAction } from "@/app/actions/reports";
import type { ChainOverviewReport, StoreScope } from "@/server/domain/reports";

interface StoreOption {
  id: string;
  name: string;
  code: string;
  city: string | null;
}

interface ChainReportsClientProps {
  initialReport: ChainOverviewReport;
  stores: StoreOption[];
  canViewAllStores: boolean;
}

export function ChainReportsClient({
  initialReport,
  stores,
  canViewAllStores,
}: ChainReportsClientProps) {
  const [report, setReport] = useState<ChainOverviewReport>(initialReport);
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const handleFilter = (storeScope: string, from?: string, to?: string) => {
    setSelectedStore(storeScope);
    startTransition(async () => {
      const scope: StoreScope = storeScope === "all" ? "all" : storeScope;
      const res = await getChainOverviewReportAction(scope, {
        from: from || undefined,
        to: to || undefined,
      });
      setReport(res);
    });
  };

  const handleExportCsv = () => {
    const headers = [
      "Store Code",
      "Store Name",
      "City",
      "Revenue (INR)",
      "COGS (INR)",
      "Gross Margin (INR)",
      "Gross Margin %",
      "Invoices",
      "Stock Value (INR)",
      "Near-Expiry Value (INR)",
      "Out of Stock SKUs",
    ];

    const rows = report.stores.map((s) => [
      s.storeCode,
      `"${s.storeName}"`,
      s.storeCity || "",
      (s.totalRevenuePaise / 100).toFixed(2),
      (s.totalCogsPaise / 100).toFixed(2),
      (s.grossMarginPaise / 100).toFixed(2),
      `${s.grossMarginPercent}%`,
      s.salesCount,
      (s.stockValuationPaise / 100).toFixed(2),
      (s.nearExpiryValuationPaise / 100).toFixed(2),
      s.outOfStockSkus,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `chain_overview_report_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const chartData = report.monthlyTrend.map((m) => ({
    name: m.month,
    Revenue: Number((m.revenuePaise / 100000).toFixed(2)), // in Lakhs
    Margin: Number((m.marginPaise / 100000).toFixed(2)),
  }));

  return (
    <ReportShell
      eyebrow="Chain-Wide Intelligence (Task B3.1)"
      title="Consolidated Chain Overview"
      description="Consolidated revenue, store rankings, gross margins, inventory valuation, and near-expiry exposure across pharmacy stores."
      backHref="/dashboard/reports"
      backLabel="Back to Reports"
      onExportCsv={handleExportCsv}
      exportLoading={isPending}
      filterBar={
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-ink-100 shadow-sm print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-ink-400" />
              <label htmlFor="store-select" className="text-xs font-semibold text-ink-600 uppercase tracking-wider">
                Store Scope:
              </label>
            </div>
            {canViewAllStores ? (
              <select
                id="store-select"
                value={selectedStore}
                onChange={(e) => handleFilter(e.target.value, fromDate, toDate)}
                className="select select-sm text-sm border-ink-200 bg-white"
                disabled={isPending}
              >
                <option value="all">All Branches (Consolidated Chain)</option>
                {stores.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.code}){st.city ? ` — ${st.city}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-medium text-ink-700 bg-ink-50 px-2.5 py-1 rounded-md border border-ink-200">
                {stores[0]?.name || "Current Store Only"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-ink-500">
              <Calendar className="h-3.5 w-3.5" />
              <span>Date Range:</span>
            </div>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                handleFilter(selectedStore, e.target.value, toDate);
              }}
              className="input input-sm text-xs border-ink-200"
            />
            <span className="text-ink-400 text-xs">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                handleFilter(selectedStore, fromDate, e.target.value);
              }}
              className="input input-sm text-xs border-ink-200"
            />
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  handleFilter(selectedStore, "", "");
                }}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      }
      kpiRow={
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="card p-4 bg-white border border-ink-100 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">Chain Revenue</span>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-xl font-bold text-ink-900">
              {formatINR(report.totalChainRevenuePaise)}
            </div>
            <div className="mt-1 text-xs text-ink-500 flex items-center gap-1">
              <span>{report.totalSalesCount} invoices</span>
            </div>
          </div>

          <div className="card p-4 bg-white border border-ink-100 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">Gross Margin</span>
              <TrendingUp className="h-4 w-4 text-teal-600" />
            </div>
            <div className="mt-2 text-xl font-bold text-teal-700">
              {formatINR(report.chainGrossMarginPaise)}
            </div>
            <div className="mt-1 text-xs font-semibold text-emerald-600 flex items-center gap-0.5">
              <ArrowUpRight className="h-3 w-3" />
              <span>{report.chainGrossMarginPercent}% gross margin</span>
            </div>
          </div>

          <div className="card p-4 bg-white border border-ink-100 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">Stock at Cost</span>
              <Boxes className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-2 text-xl font-bold text-ink-900">
              {formatINR(report.totalStockValuationPaise)}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              Across active batches
            </div>
          </div>

          <div className="card p-4 bg-white border border-ink-100 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">Near-Expiry Risk</span>
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 text-xl font-bold text-amber-600">
              {formatINR(report.totalNearExpiryValuationPaise)}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              Expiring in 0–90 days
            </div>
          </div>

          <div className="card p-4 bg-white border border-ink-100 shadow-sm rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">Stock-Out SKUs</span>
              <PackageX className="h-4 w-4 text-rose-500" />
            </div>
            <div className="mt-2 text-xl font-bold text-rose-600">
              {report.totalOutOfStockSkus}
            </div>
            <div className="mt-1 text-xs text-ink-500">
              Requiring replenishment
            </div>
          </div>
        </div>
      }
    >
      {/* Store Leaderboard & Comparison Table */}
      <div className="card bg-white border border-ink-100 rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-ink-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
              <Store className="h-4 w-4 text-teal-600" />
              Branch Performance & Health Ranking
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Ranked by total revenue generation with profitability and inventory health indicators.
            </p>
          </div>
          <span className="text-xs font-medium bg-ink-50 text-ink-600 px-2.5 py-1 rounded-md border border-ink-200">
            {report.stores.length} {report.stores.length === 1 ? "Store" : "Stores"} Reporting
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-ink-50/75 border-b border-ink-100 text-ink-500 font-medium">
              <tr>
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">Store Name</th>
                <th className="py-3 px-4">City</th>
                <th className="py-3 px-4 text-right">Revenue</th>
                <th className="py-3 px-4 text-right">COGS</th>
                <th className="py-3 px-4 text-right">Gross Margin</th>
                <th className="py-3 px-4 text-center">Margin %</th>
                <th className="py-3 px-4 text-right">Invoices</th>
                <th className="py-3 px-4 text-right">Stock Valuation</th>
                <th className="py-3 px-4 text-right">Near Expiry</th>
                <th className="py-3 px-4 text-center">OOS SKUs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {report.stores.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-ink-400">
                    No store operational data found for the selected filter.
                  </td>
                </tr>
              ) : (
                report.stores.map((st, idx) => (
                  <tr key={st.storeId} className="hover:bg-ink-50/50 transition-colors">
                    <td className="py-3 px-4 text-center font-mono text-ink-400 font-semibold">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-ink-900">{st.storeName}</div>
                      <div className="text-[11px] text-ink-400 font-mono">Code: {st.storeCode}</div>
                    </td>
                    <td className="py-3 px-4 text-ink-600">
                      {st.storeCity || "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-ink-900">
                      {formatINR(st.totalRevenuePaise)}
                    </td>
                    <td className="py-3 px-4 text-right text-ink-500 font-mono">
                      {formatINR(st.totalCogsPaise)}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-teal-700">
                      {formatINR(st.grossMarginPaise)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          st.grossMarginPercent >= 20
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : st.grossMarginPercent >= 10
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}
                      >
                        {st.grossMarginPercent}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-ink-600">
                      {st.salesCount}
                    </td>
                    <td className="py-3 px-4 text-right text-ink-700 font-mono">
                      {formatINR(st.stockValuationPaise)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {st.nearExpiryValuationPaise > 0 ? (
                        <span className="text-amber-600 font-medium">
                          {formatINR(st.nearExpiryValuationPaise)}
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {st.outOfStockSkus > 0 ? (
                        <span className="badge badge-warning text-[11px]">
                          {st.outOfStockSkus} SKUs
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold">Healthy</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {report.stores.length > 0 && (
              <tfoot className="bg-ink-50/90 border-t-2 border-ink-200 font-semibold text-ink-900">
                <tr>
                  <td colSpan={3} className="py-3 px-4 text-ink-600 uppercase text-[11px] tracking-wider">
                    Chain Consolidated Totals
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-ink-900">
                    {formatINR(report.totalChainRevenuePaise)}
                  </td>
                  <td className="py-3 px-4 text-right text-ink-600 font-mono">
                    {formatINR(report.totalChainCogsPaise)}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-teal-700">
                    {formatINR(report.chainGrossMarginPaise)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-teal-100 text-teal-800">
                      {report.chainGrossMarginPercent}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {report.totalSalesCount}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    {formatINR(report.totalStockValuationPaise)}
                  </td>
                  <td className="py-3 px-4 text-right text-amber-700 font-mono">
                    {formatINR(report.totalNearExpiryValuationPaise)}
                  </td>
                  <td className="py-3 px-4 text-center text-ink-600 font-mono">
                    {report.totalOutOfStockSkus} max
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 6-Month Monthly Trend Visual Chart */}
      {chartData.length > 0 && (
        <div className="card bg-white p-5 border border-ink-100 rounded-xl shadow-sm">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-ink-900">6-Month Chain Sales & Margin Trend</h2>
            <p className="text-xs text-ink-500">Historical performance across the selected scope (amounts in ₹ Lakhs).</p>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f2f5" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} unit="L" />
                <Tooltip
                  formatter={(val: number | string | undefined) => [`₹${val} Lakhs`, ""]}
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderColor: "#e2e8f0",
                    borderRadius: "0.5rem",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="Revenue" fill="#0d9488" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Margin" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
