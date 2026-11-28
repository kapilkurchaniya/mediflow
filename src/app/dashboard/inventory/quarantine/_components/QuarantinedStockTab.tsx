"use client";

import React from "react";
import { formatINR, formatNumber } from "@/lib/format";
import { CheckCircle2, FileCheck2, Loader2, Search } from "lucide-react";
import type { QuarantinedItem } from "./types";

interface Props {
  filteredQuarantined: QuarantinedItem[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedSupplierFilter: string;
  setSelectedSupplierFilter: (s: string) => void;
  suppliersList: string[];
  selectedQuarantineIds: string[];
  setSelectedQuarantineIds: React.Dispatch<React.SetStateAction<string[]>>;
  handleGenerateSupplierClaim: () => void;
  isSubmitting: boolean;
}

export function QuarantinedStockTab({
  filteredQuarantined,
  searchQuery,
  setSearchQuery,
  selectedSupplierFilter,
  setSelectedSupplierFilter,
  suppliersList,
  selectedQuarantineIds,
  setSelectedQuarantineIds,
  handleGenerateSupplierClaim,
  isSubmitting,
}: Props) {
  const allSelected =
    filteredQuarantined.length > 0 &&
    selectedQuarantineIds.length === filteredQuarantined.length;

  return (
    <div className="space-y-4">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-1 max-w-md border border-ink-200 rounded-lg px-3 py-1.5 bg-white shadow-xs focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
          <Search className="w-4 h-4 text-ink-400 shrink-0" />
          <input
            type="text"
            placeholder="Search quarantined medicine, batch #, supplier..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-ink-900 placeholder:text-ink-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2.5">
          <select
            value={selectedSupplierFilter}
            onChange={(e) => setSelectedSupplierFilter(e.target.value)}
            aria-label="Filter quarantined stock by supplier"
            className="input input-sm text-xs"
          >
            <option value="all">All Distributors</option>
            {suppliersList.map((sup) => (
              <option key={sup} value={sup}>
                {sup}
              </option>
            ))}
          </select>

          {selectedQuarantineIds.length > 0 && (
            <button
              onClick={handleGenerateSupplierClaim}
              disabled={isSubmitting}
              className="btn btn-primary btn-sm"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileCheck2 className="w-3.5 h-3.5" />
              )}
              Create Debit Note ({selectedQuarantineIds.length})
            </button>
          )}
        </div>
      </div>

      {/* Content Table / Empty State */}
      {filteredQuarantined.length === 0 ? (
        <div className="card p-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
          <h4 className="font-semibold text-ink-900 text-sm">
            No Quarantined Stock Awaiting Claims
          </h4>
          <p className="text-xs text-ink-500 mt-1 max-w-sm mx-auto">
            No dump stock currently in quarantine. Check the Near-Expiry tab to isolate expired batches from active inventory.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
            <thead>
              <tr>
                <th className="w-8 !px-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedQuarantineIds(filteredQuarantined.map((q) => q.id));
                      } else {
                        setSelectedQuarantineIds([]);
                      }
                    }}
                    aria-label="Select all quarantined items"
                    className="checkbox"
                  />
                </th>
                <th>Medicine & Batch</th>
                <th>Distributor / Supplier</th>
                <th>Reason</th>
                <th className="text-right">Quarantined Qty</th>
                <th className="text-right">Cost Rate</th>
                <th className="text-right">Total Debit Value</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuarantined.map((item) => {
                const isSelected = selectedQuarantineIds.includes(item.id);
                return (
                  <tr
                    key={item.id}
                    className={isSelected ? "!bg-brand-50/40" : undefined}
                  >
                    <td className="!px-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedQuarantineIds((prev) => [...prev, item.id]);
                          } else {
                            setSelectedQuarantineIds((prev) => prev.filter((id) => id !== item.id));
                          }
                        }}
                        aria-label={`Select ${item.medicineName} batch ${item.batchNo}`}
                        className="checkbox"
                      />
                    </td>
                    <td>
                      <div className="cell-primary">{item.medicineName}</div>
                      <div className="cell-sub flex items-center gap-2">
                        <span>Batch: <strong className="font-mono text-ink-700">{item.batchNo}</strong></span>
                        <span>•</span>
                        <span>Exp: <strong className="text-ink-700">{item.expiryDate}</strong></span>
                      </div>
                    </td>
                    <td className="font-medium text-ink-800">{item.supplierName}</td>
                    <td>
                      <span
                        className={
                          item.reason === "expired"
                            ? "badge badge-danger uppercase text-[10px]"
                            : item.reason === "damaged"
                            ? "badge badge-warning uppercase text-[10px]"
                            : "badge badge-neutral uppercase text-[10px]"
                        }
                      >
                        {item.reason}
                      </span>
                    </td>
                    <td className="text-right font-semibold text-ink-900 num">
                      {formatNumber(item.qty)} {item.looseUnit}s
                    </td>
                    <td className="text-right text-ink-600 num">
                      {formatINR(item.ratePaise)}
                    </td>
                    <td className="text-right font-bold text-ink-900 num">
                      {formatINR(item.totalPaise)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
