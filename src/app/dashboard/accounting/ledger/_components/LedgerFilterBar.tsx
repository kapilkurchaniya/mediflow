"use client";

import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { DateRangeFilter } from "@/app/components/DateRangeFilter";
import type { AccountInfo, LedgerFilter, ReportStoreScope } from "@/server/domain/accounting-reports";
import { exportLedgerCsvAction } from "@/app/actions/accounting-reports";

interface StoreOption {
  id: string;
  name: string;
  code: string;
}

interface PartyOption {
  id: string;
  name: string;
}

interface LedgerFilterBarProps {
  accounts: AccountInfo[];
  currentAccountId: string;
  stores: StoreOption[];
  canViewAll: boolean;
  storeScope: ReportStoreScope;
  isControlAccount: boolean;
  partyType?: "customer" | "supplier" | null;
  parties: PartyOption[];
  currentPartyId?: string | null;
  filter: LedgerFilter;
}

export function LedgerFilterBar({
  accounts,
  currentAccountId,
  stores,
  canViewAll,
  storeScope,
  isControlAccount,
  partyType,
  parties,
  currentPartyId,
  filter,
}: LedgerFilterBarProps) {
  const router = useRouter();
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    try {
      setIsExporting(true);
      const csv = await exportLedgerCsvAction(filter);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `ledger-${filter.accountId}-${filter.dateRange.from ?? "all"}-${filter.dateRange.to ?? "all"}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export ledger CSV", err);
    } finally {
      setIsExporting(false);
    }
  }

  function handleAccountChange(newAccountId: string) {
    const params = new URLSearchParams(window.location.search);
    params.delete("partyId"); // reset party when switching account
    router.push(`/dashboard/accounting/ledger/${newAccountId}?${params.toString()}`);
  }

  return (
    <div className="card bg-white border border-slate-200 p-4 shadow-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Account Selector */}
        <div className="form-control min-w-[280px]">
          <label className="label py-1 text-xs font-medium text-slate-600">Select Ledger Account</label>
          <select
            value={currentAccountId}
            onChange={(e) => handleAccountChange(e.target.value)}
            className="select select-sm select-bordered font-medium text-xs"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.code} — {acc.name} ({acc.type})
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-end pt-5">
          <button
            onClick={() => router.refresh()}
            className="btn btn-ghost btn-xs gap-1"
            title="Refresh Ledger"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="btn btn-outline btn-xs gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? "Exporting..." : "Export CSV"}</span>
          </button>
        </div>
      </div>

      {/* Date, Store, and Party Filters */}
      <form method="GET" className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
        <DateRangeFilter />

        {/* Store Selector */}
        {canViewAll && (
          <div className="form-control">
            <label className="label py-1 text-xs font-medium text-slate-600">Store Scope</label>
            <select
              name="store"
              defaultValue={
                storeScope.type === "all"
                  ? "all"
                  : storeScope.type === "unallocated"
                    ? "unallocated"
                    : storeScope.storeId
              }
              className="select select-sm select-bordered text-xs"
            >
              <option value="all">Consolidated (All Stores)</option>
              <option value="unallocated">Unallocated / Tenant-Wide</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Party Selector for Control Accounts */}
        {isControlAccount && (
          <div className="form-control min-w-[200px]">
            <label className="label py-1 text-xs font-medium text-slate-600">
              Filter {partyType === "customer" ? "Customer" : "Supplier"}
            </label>
            <select
              name="partyId"
              defaultValue={currentPartyId ?? ""}
              className="select select-sm select-bordered text-xs"
            >
              <option value="">All {partyType === "customer" ? "Customers" : "Suppliers"}</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-end self-end pt-5">
          <button type="submit" className="btn btn-sm btn-primary">
            Apply Filters
          </button>
        </div>
      </form>
    </div>
  );
}
