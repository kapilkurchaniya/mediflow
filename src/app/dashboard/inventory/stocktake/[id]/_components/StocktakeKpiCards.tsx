"use client";

import React from "react";
import { formatINR } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { AuditSummary } from "./types";

interface Props {
  summary: AuditSummary;
}

export function StocktakeKpiCards({ summary }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
      <div className="card p-4">
        <div className="eyebrow">Count Progress</div>
        <div className="text-xl font-bold text-ink-900 mt-1 num">
          {summary.countedLines} / {summary.totalLines} lines
        </div>
        <div className="text-[11px] text-ink-400 mt-0.5">
          {summary.pendingLines} uncounted batches
        </div>
      </div>

      <div className="card p-4">
        <div className="text-xs text-rose-600 font-semibold uppercase flex items-center gap-1">
          <ArrowDownLeft className="w-3.5 h-3.5" /> Shortages (Shelf Loss)
        </div>
        <div className="text-xl font-bold text-rose-600 mt-1 num">
          {formatINR(summary.totalShortageCostPaise)}
        </div>
        <div className="text-[11px] text-ink-400 mt-0.5">
          {summary.shortageLines} lines short
        </div>
      </div>

      <div className="card p-4">
        <div className="text-xs text-emerald-600 font-semibold uppercase flex items-center gap-1">
          <ArrowUpRight className="w-3.5 h-3.5" /> Excess Stock
        </div>
        <div className="text-xl font-bold text-emerald-600 mt-1 num">
          {formatINR(summary.totalExcessCostPaise)}
        </div>
        <div className="text-[11px] text-ink-400 mt-0.5">
          {summary.excessLines} lines found surplus
        </div>
      </div>

      <div className="card p-4">
        <div className="eyebrow">Net Ledger Variance</div>
        <div
          className={`text-xl font-bold mt-1 num ${
            summary.netVarianceCostPaise < 0
              ? "text-rose-600"
              : summary.netVarianceCostPaise > 0
              ? "text-emerald-600"
              : "text-ink-700"
          }`}
        >
          {formatINR(Math.abs(summary.netVarianceCostPaise))}
          <span className="text-xs font-normal ml-1">
            {summary.netVarianceCostPaise < 0 ? "(Short)" : summary.netVarianceCostPaise > 0 ? "(Gain)" : ""}
          </span>
        </div>
        <div className="text-[11px] text-ink-400 mt-0.5">
          Valued at purchase rate (cost)
        </div>
      </div>
    </div>
  );
}
