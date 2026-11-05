"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Search, Calendar } from "lucide-react";
import type { AgeingMode } from "@/server/domain/receivables";

interface ReceivablesFilterBarProps {
  asOfDate: string;
  mode: AgeingMode;
  currentStore: string;
  search: string;
  onlyOverdue: boolean;
  stores: { id: string; name: string; code: string }[];
  canViewAll: boolean;
}

export function ReceivablesFilterBar({
  asOfDate,
  mode,
  currentStore,
  search,
  onlyOverdue,
  stores,
  canViewAll,
}: ReceivablesFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = (key: string, val: string | null) => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    if (val === null || val === "" || (key === "overdue" && val === "false")) {
      next.delete(key);
    } else {
      next.set(key, val);
    }
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-neutral-200 space-y-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Ageing Mode Toggle */}
        <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded-lg border border-neutral-200 text-xs font-medium">
          <button
            type="button"
            onClick={() => updateParam("mode", "due_date")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              mode === "due_date"
                ? "bg-white text-neutral-900 shadow-sm font-semibold"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Due-Date Ageing (Overdue)
          </button>
          <button
            type="button"
            onClick={() => updateParam("mode", "invoice_date")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              mode === "invoice_date"
                ? "bg-white text-neutral-900 shadow-sm font-semibold"
                : "text-neutral-600 hover:text-neutral-900"
            }`}
          >
            Invoice-Date Ageing (Bill Age)
          </button>
        </div>

        {/* Store Scope Selector */}
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-neutral-400 shrink-0" />
          <select
            value={currentStore}
            onChange={(e) => updateParam("store", e.target.value)}
            className="text-xs bg-neutral-50 border border-neutral-300 rounded-lg px-2.5 py-1.5 font-medium text-neutral-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            {canViewAll && <option value="all">Consolidated All Stores</option>}
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                Store: {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-neutral-100">
        {/* As-Of Date */}
        <div className="flex items-center gap-1.5 text-xs text-neutral-600">
          <Calendar className="w-4 h-4 text-neutral-400" />
          <span className="font-medium">As of:</span>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => updateParam("asOf", e.target.value)}
            className="text-xs bg-neutral-50 border border-neutral-300 rounded-lg px-2 py-1 font-mono text-neutral-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Search Customer */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search customer name or phone..."
            defaultValue={search}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                updateParam("search", (e.target as HTMLInputElement).value || null);
              }
            }}
            onBlur={(e: React.FocusEvent<HTMLInputElement>) => updateParam("search", e.target.value || null)}
            className="w-full text-xs pl-8 pr-3 py-1.5 h-8 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* Only Overdue Filter */}
        <label className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyOverdue}
            onChange={(e) => updateParam("overdue", e.target.checked ? "true" : "false")}
            className="rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
          />
          <span>Only Overdue Customers</span>
        </label>
      </div>
    </div>
  );
}
