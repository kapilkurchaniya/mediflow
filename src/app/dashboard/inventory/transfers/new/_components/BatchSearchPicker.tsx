"use client";

import { Loader2, Plus, Search } from "lucide-react";
import { formatINR } from "@/lib/format";

export interface BatchSearchResult {
  id: string;
  medicineId: string;
  medicineName: string;
  batchNo: string;
  expiryDate: string;
  qtyOnHand: number;
  unitCost: number | null;
  mrp: number | null;
}

interface BatchSearchPickerProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  isSearching: boolean;
  searchResults: BatchSearchResult[];
  lines: { fromBatchId: string }[];
  onSelectBatch: (batch: BatchSearchResult) => void;
}

export function BatchSearchPicker({
  searchQuery,
  onSearchChange,
  isSearching,
  searchResults,
  lines,
  onSelectBatch,
}: BatchSearchPickerProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        type="text"
        placeholder="Search medicine name or batch # in source store..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      {isSearching && (
        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-400" />
      )}

      {searchResults.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-ink-200 bg-white shadow-lg">
          {searchResults.map((b) => {
            const alreadySelected = lines.some((l) => l.fromBatchId === b.id);
            return (
              <div
                key={b.id}
                onClick={() => !alreadySelected && onSelectBatch(b)}
                className={`flex items-center justify-between p-3 border-b border-ink-100 last:border-0 ${
                  alreadySelected
                    ? "bg-ink-50 text-ink-400 cursor-not-allowed"
                    : "cursor-pointer hover:bg-brand-50/50"
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{b.medicineName}</p>
                  <p className="text-xs text-ink-500">
                    Batch: <span className="font-mono font-medium">{b.batchNo}</span> | Exp: {b.expiryDate} | On Hand: <span className="font-semibold text-ink-800">{b.qtyOnHand}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-ink-700">{formatINR(b.unitCost)} / unit</span>
                  {alreadySelected ? (
                    <span className="text-[11px] text-ink-400">Added</span>
                  ) : (
                    <span className="rounded bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Add
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
