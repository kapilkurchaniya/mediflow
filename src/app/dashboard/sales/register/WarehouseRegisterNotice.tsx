"use client";

import Link from "next/link";
import { Building2, ArrowLeftRight, Store } from "lucide-react";
import { useShell } from "@/app/components/ShellContext";

export function WarehouseRegisterNotice({ storeName }: { storeName: string }) {
  const { setStoreSwitcherOpen } = useShell();

  return (
    <div className="mx-auto max-w-2xl py-8">
      <div className="rounded-2xl border border-ink-200 bg-white p-6 sm:p-8 shadow-xs text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20">
          <Building2 className="h-6 w-6" />
        </div>

        <h2 className="mt-4 text-lg font-bold text-ink-950">
          Cash Register Restricted in Warehouse Mode
        </h2>
        <p className="mt-2 text-sm text-ink-600 leading-relaxed max-w-lg mx-auto">
          <strong>{storeName}</strong> is configured as a warehouse facility. Physical cash drawers,
          opening float tallies, and closing Z-Reports are only applicable to retail branch counters.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setStoreSwitcherOpen(true)}
            className="btn btn-primary"
          >
            <Store className="h-4 w-4" />
            Switch to a Retail Branch
          </button>
          <Link href="/dashboard/inventory/transfers" className="btn btn-secondary">
            <ArrowLeftRight className="h-4 w-4" />
            Stock Transfers
          </Link>
        </div>
      </div>
    </div>
  );
}
