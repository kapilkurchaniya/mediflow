"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  Boxes,
  Building2,
  LayoutGrid,
  Store,
  Truck,
} from "lucide-react";
import { useShell } from "@/app/components/ShellContext";
import type { AllowedStoreItem } from "@/server/domain/stores";

interface WarehousePosNoticeProps {
  currentStore?: AllowedStoreItem | null;
}

export function WarehousePosNotice({ currentStore }: WarehousePosNoticeProps) {
  const { setStoreSwitcherOpen } = useShell();
  const storeName = currentStore?.name ?? "Central Warehouse";
  const storeCode = currentStore?.code ?? "WH";

  return (
    <div className="mx-auto max-w-4xl py-8 px-4 sm:px-6">
      <div className="rounded-2xl border border-ink-200/80 bg-white/90 p-6 sm:p-8 shadow-sm backdrop-blur-md">
        {/* Header with Warehouse Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-ink-150">
          <div className="flex items-center gap-3.5">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  Warehouse Mode Active
                </span>
                <span className="text-xs font-mono text-ink-500">[{storeCode}]</span>
              </div>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-ink-950">
                {storeName}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStoreSwitcherOpen(true)}
            className="btn btn-secondary self-start sm:self-auto"
            title="Switch branch (Ctrl+Shift+S)"
          >
            <Store className="h-4 w-4" />
            Switch Store
          </button>
        </div>

        {/* Informational Notice */}
        <div className="mt-6 rounded-xl bg-ink-50/80 p-4 border border-ink-150 text-sm text-ink-700 leading-relaxed">
          <p className="font-medium text-ink-900 mb-1">
            Counter Sales & POS Billing Unavailable in Warehouse Mode
          </p>
          <p>
            This facility is configured as a central warehouse and distribution depot. Retail POS
            billing, cash registers, split tenders, and counter dispensing are restricted to retail
            branch locations. Use stock transfers to move inventory to retail stores for customer billing.
          </p>
        </div>

        {/* Action Hub Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-ink-150 bg-white p-4.5 shadow-2xs hover:border-ink-300 transition-colors">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              <ArrowLeftRight className="h-4.5 w-4.5" />
            </div>
            <h2 className="mt-3 text-sm font-semibold text-ink-900">Stock Transfers</h2>
            <p className="mt-1 text-xs text-ink-500 leading-normal">
              Dispatch consignments to retail branches or inspect inbound store shipments.
            </p>
            <Link
              href="/dashboard/inventory/transfers"
              className="mt-3.5 inline-flex items-center text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Open Transfers &rarr;
            </Link>
          </div>

          <div className="rounded-xl border border-ink-150 bg-white p-4.5 shadow-2xs hover:border-ink-300 transition-colors">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Truck className="h-4.5 w-4.5" />
            </div>
            <h2 className="mt-3 text-sm font-semibold text-ink-900">Purchases & GRN</h2>
            <p className="mt-1 text-xs text-ink-500 leading-normal">
              Receive goods inwards from pharma distributors and book landed costs.
            </p>
            <Link
              href="/dashboard/purchases"
              className="mt-3.5 inline-flex items-center text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Supplier Invoices &rarr;
            </Link>
          </div>

          <div className="rounded-xl border border-ink-150 bg-white p-4.5 shadow-2xs hover:border-ink-300 transition-colors">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50 text-purple-700">
              <Boxes className="h-4.5 w-4.5" />
            </div>
            <h2 className="mt-3 text-sm font-semibold text-ink-900">Batches & Inventory</h2>
            <p className="mt-1 text-xs text-ink-500 leading-normal">
              Manage warehouse lot inventory, expiry dates, and warehouse batch balances.
            </p>
            <Link
              href="/dashboard/inventory/batches"
              className="mt-3.5 inline-flex items-center text-xs font-medium text-purple-700 hover:text-purple-800"
            >
              View Stock Lots &rarr;
            </Link>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 pt-5 border-t border-ink-150 flex items-center justify-between text-xs text-ink-500">
          <span>Facility Type: <strong className="text-ink-800 uppercase">Warehouse</strong></span>
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-ink-700 hover:text-ink-950 font-medium">
            <LayoutGrid className="h-3.5 w-3.5" />
            Return to Overview
          </Link>
        </div>
      </div>
    </div>
  );
}
