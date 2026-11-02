"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeftRight, ArrowRight, FileText, Plus, Search, Truck } from "lucide-react";
import { formatINR } from "@/lib/format";

interface TransferItem {
  id: string;
  transferNo: string;
  fromStoreId: string;
  fromStoreName: string;
  toStoreId: string;
  toStoreName: string;
  status: string;
  docKind: string;
  documentNo: string | null;
  documentDate: Date | string | null;
  totalValuePaise: number;
  transportMode: string | null;
  vehicleNo: string | null;
  createdAt: Date | string;
}

interface TransfersListClientProps {
  initialTransfers: TransferItem[];
  stores: { id: string; name: string }[];
  activeStoreId: string;
}

const STATUS_TABS = [
  { id: "all", label: "All Transfers" },
  { id: "draft", label: "Drafts" },
  { id: "dispatched", label: "In Transit" },
  { id: "received", label: "Received" },
  { id: "cancelled", label: "Cancelled" },
];

export function TransfersListClient({
  initialTransfers,
  stores,
  activeStoreId,
}: TransfersListClientProps) {
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedStore, setSelectedStore] = useState<string>(activeStoreId || "all");

  const filtered = initialTransfers.filter((t) => {
    if (selectedTab !== "all") {
      if (selectedTab === "received" && (t.status === "received" || t.status === "partially_received")) {
        // match
      } else if (t.status !== selectedTab) {
        return false;
      }
    }
    if (selectedStore !== "all" && t.fromStoreId !== selectedStore && t.toStoreId !== selectedStore) {
      return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchNo = t.transferNo.toLowerCase().includes(q);
      const matchDoc = t.documentNo ? t.documentNo.toLowerCase().includes(q) : false;
      const matchFrom = t.fromStoreName.toLowerCase().includes(q);
      const matchTo = t.toStoreName.toLowerCase().includes(q);
      if (!matchNo && !matchDoc && !matchFrom && !matchTo) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Stock Transfers</h1>
          <p className="text-sm text-ink-500">
            Inter-store stock movements with Rule 55 Delivery Challans and Rule 46 Tax Invoices.
          </p>
        </div>
        <Link
          href="/dashboard/inventory/transfers/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Transfer
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5 border-b border-ink-200 pb-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedTab === tab.id
                  ? "bg-brand-50 text-brand-700 font-semibold"
                  : "text-ink-600 hover:bg-ink-50 hover:text-ink-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              placeholder="Search transfer or doc #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-ink-200 bg-white py-1.5 pl-9 pr-3 text-xs placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="rounded-lg border border-ink-200 bg-white py-1.5 px-3 text-xs text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="all">All Branches</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-xs">
        <table className="min-w-full divide-y divide-ink-200 text-left text-xs">
          <thead className="bg-ink-50/50 text-ink-600 font-medium">
            <tr>
              <th className="py-3 px-4">Transfer #</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4">Movement (From &rarr; To)</th>
              <th className="py-3 px-4">Statutory Document</th>
              <th className="py-3 px-4 text-right">Valuation</th>
              <th className="py-3 px-4 text-center">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 text-ink-700">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <ArrowLeftRight className="h-10 w-10 text-ink-300 mb-2" />
                    <p className="text-sm font-medium text-ink-800">No stock transfers found</p>
                    <p className="text-xs text-ink-400 mt-1">Create a transfer to move batches between your pharmacy stores.</p>
                    <Link
                      href="/dashboard/inventory/transfers/new"
                      className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Create Transfer
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="hover:bg-ink-50/50 transition-colors">
                  <td className="py-3 px-4 font-semibold text-ink-900">
                    <Link href={`/dashboard/inventory/transfers/${t.id}`} className="hover:text-brand-600">
                      {t.transferNo}
                    </Link>
                  </td>
                  <td className="py-3 px-4 text-ink-500">
                    {format(new Date(t.createdAt), "dd MMM yyyy")}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-ink-800">{t.fromStoreName}</span>
                      <ArrowRight className="h-3 w-3 text-ink-400" />
                      <span className="font-medium text-ink-800">{t.toStoreName}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium w-fit ${
                          t.docKind === "tax_invoice"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                        }`}
                      >
                        <FileText className="h-3 w-3" />
                        {t.docKind === "tax_invoice" ? "Rule 46 Invoice" : "Rule 55 Challan"}
                      </span>
                      {t.documentNo && (
                        <span className="text-[10px] text-ink-400 mt-0.5">{t.documentNo}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-medium text-ink-900">
                    {formatINR(t.totalValuePaise)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/dashboard/inventory/transfers/${t.id}`}
                      className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-200 transition-colors"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "draft":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-ink-100 text-ink-700">
          Draft
        </span>
      );
    case "dispatched":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <Truck className="h-3 w-3" /> In Transit
        </span>
      );
    case "partially_received":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
          Partially Received
        </span>
      );
    case "received":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          Received
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
          Cancelled
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-ink-100 text-ink-700">
          {status}
        </span>
      );
  }
}
