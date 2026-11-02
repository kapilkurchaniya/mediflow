"use client";

import React, { useState } from "react";
import { formatINR, formatNumber } from "@/lib/format";
import { Lock, Search } from "lucide-react";
import type { AuditItem } from "./types";

interface Props {
  items: AuditItem[];
  countInputs: Record<string, string>;
  onCountChange: (itemId: string, value: string) => void;
  isClosed: boolean;
}

export function StocktakeTable({
  items,
  countInputs,
  onCountChange,
  isClosed,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "discrepancies" | "pending">("all");

  const filteredItems = items.filter((item) => {
    if (filterMode === "discrepancies") {
      if (item.varianceQty === null || item.varianceQty === 0) return false;
    } else if (filterMode === "pending") {
      if (item.countedQty !== null) return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.medicineName.toLowerCase().includes(q) ||
        item.batchNo.toLowerCase().includes(q) ||
        item.rackCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-1 max-w-md border border-ink-200 rounded-lg px-3 py-1.5 bg-white shadow-xs focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
          <Search className="w-4 h-4 text-ink-400 shrink-0" />
          <input
            type="text"
            placeholder="Search medicine, batch #, or rack code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-ink-900 placeholder:text-ink-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 border border-ink-200 rounded-lg p-1 bg-ink-50 text-xs">
          {(["all", "discrepancies", "pending"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1 rounded-md capitalize font-medium transition-all ${
                filterMode === mode
                  ? "bg-white text-ink-900 shadow-xs font-semibold"
                  : "text-ink-600 hover:text-ink-900"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Items Count Sheet Table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rack</th>
              <th>Medicine & Batch</th>
              <th>Expiry</th>
              <th className="text-right">System Qty</th>
              <th className="text-right w-32">Physical Count</th>
              <th className="text-right">Variance</th>
              <th className="text-right">Financial Impact</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const isShort = (item.varianceQty || 0) < 0;
              const currentInput = countInputs[item.id] ?? (item.countedQty !== null ? String(item.countedQty) : "");

              return (
                <tr key={item.id}>
                  <td>
                    <span className="font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded text-[11px] font-mono">
                      {item.rackCode}
                    </span>
                  </td>
                  <td>
                    <div className="cell-primary">{item.medicineName}</div>
                    <div className="cell-sub">
                      Batch: <strong className="font-mono text-ink-700">{item.batchNo}</strong>
                    </div>
                  </td>
                  <td className="text-ink-500 font-mono text-xs">{item.expiryDate}</td>

                  {/* System Qty (Masked in blind mode for counting staff) */}
                  <td className="text-right font-medium num">
                    {item.systemQty === null ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-ink-400 italic">
                        <Lock className="w-3 h-3" /> Blind
                      </span>
                    ) : (
                      <span>{formatNumber(item.systemQty)} {item.looseUnit}s</span>
                    )}
                  </td>

                  {/* Physical Count Input */}
                  <td className="text-right">
                    {isClosed ? (
                      <span className="font-bold text-ink-900 num">
                        {item.countedQty !== null ? formatNumber(item.countedQty) : "—"}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        placeholder="Count"
                        value={currentInput}
                        onChange={(e) => onCountChange(item.id, e.target.value)}
                        className="input input-sm w-24 text-right font-bold"
                      />
                    )}
                  </td>

                  {/* Variance Qty */}
                  <td className="text-right font-bold num">
                    {item.varianceQty === null ? (
                      <span className="text-ink-400 font-normal italic">Pending</span>
                    ) : item.varianceQty === 0 ? (
                      <span className="text-ink-400 font-normal">Exact (0)</span>
                    ) : isShort ? (
                      <span className="text-rose-600">
                        {item.varianceQty} {item.looseUnit}s
                      </span>
                    ) : (
                      <span className="text-emerald-600">
                        +{item.varianceQty} {item.looseUnit}s
                      </span>
                    )}
                  </td>

                  {/* Financial Impact */}
                  <td className="text-right font-bold num">
                    {item.varianceQty === null || item.varianceQty === 0 ? (
                      <span className="text-ink-400 font-normal">₹0.00</span>
                    ) : isShort ? (
                      <span className="text-rose-600">
                        -{formatINR(Math.abs(item.varianceCostPaise))}
                      </span>
                    ) : (
                      <span className="text-emerald-600">
                        +{formatINR(item.varianceCostPaise)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
