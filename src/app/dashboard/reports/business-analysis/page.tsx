"use client";

import React, { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { getBusinessAnalysisAction } from "@/app/actions/control-room";
import type { PivotRow } from "@/server/domain/reports/business-analysis";
import { formatINR } from "@/lib/format";

export default function BusinessAnalysisPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [dimension, setDimension] = useState<"category" | "manufacturer" | "medicine">("manufacturer");
  const [rows, setRows] = useState<PivotRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(nextDim = dimension) {
    setLoading(true);
    try {
      const res = await getBusinessAnalysisAction({ from, to, dimension: nextDim });
      if (res.success && res.rows) {
        setRows(res.rows);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    getBusinessAnalysisAction({ from, to, dimension }).then((res) => {
      if (!active) return;
      if (res.success && res.rows) setRows(res.rows);
      setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink-900">Business Analysis Pivot</h1>
            <p className="text-xs text-ink-500">
              Turnover, COGS, and Gross Margin % pivoted by Manufacturer, Category, or Medicine.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-auto"
            value={dimension}
            onChange={(e) => {
              const d = e.target.value as "category" | "manufacturer" | "medicine";
              setDimension(d);
              void load(d);
            }}
          >
            <option value="manufacturer">By Company / Manufacturer</option>
            <option value="category">By Category</option>
            <option value="medicine">By Medicine</option>
          </select>
          <input type="date" className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          <button type="button" onClick={() => load()} disabled={loading} className="btn btn-primary btn-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-500">No completed sales found for {from} to {to}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-xs uppercase text-ink-500">
                <tr>
                  <th className="p-3 text-left capitalize">{dimension}</th>
                  <th className="p-3 text-right">Units Sold</th>
                  <th className="p-3 text-right">Gross Sales</th>
                  <th className="p-3 text-right">COGS</th>
                  <th className="p-3 text-right">Gross Margin</th>
                  <th className="p-3 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((r) => (
                  <tr key={r.groupKey}>
                    <td className="p-3 font-medium text-ink-900">{r.label}</td>
                    <td className="p-3 text-right font-mono">{r.unitsSold}</td>
                    <td className="p-3 text-right font-mono font-semibold">{formatINR(r.grossSalesPaise)}</td>
                    <td className="p-3 text-right font-mono text-ink-600">{formatINR(r.cogsPaise)}</td>
                    <td className="p-3 text-right font-mono text-emerald-700 font-semibold">{formatINR(r.grossMarginPaise)}</td>
                    <td className="p-3 text-right font-mono font-bold">{r.marginPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
