"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Truck,
  Search,
  Copy,
  Check,
  Printer,
  Edit3,
  Ban,
  ArrowRight,
} from "lucide-react";
import { formatINR } from "@/lib/money";
import type { EWayBillItem, ValidityStatus } from "./types";

interface EWayBillTableProps {
  items: EWayBillItem[];
  filter: "all" | "active" | "expiring_soon" | "expired" | "cancelled";
  setFilter: (f: "all" | "active" | "expiring_soon" | "expired" | "cancelled") => void;
  search: string;
  setSearch: (s: string) => void;
  getValidityStatus: (item: EWayBillItem) => ValidityStatus;
  onOpenUpdate: (item: EWayBillItem) => void;
  onOpenCancel: (item: EWayBillItem) => void;
}

export function EWayBillTable({
  items,
  filter,
  setFilter,
  search,
  setSearch,
  getValidityStatus,
  onOpenUpdate,
  onOpenCancel,
}: EWayBillTableProps) {
  const [copiedEwb, setCopiedEwb] = useState<string | null>(null);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedEwb(text);
    setTimeout(() => setCopiedEwb(null), 2000);
  }

  return (
    <div className="card rounded-xl border border-ink-150 bg-white p-4 shadow-2xs space-y-4">
      {/* Filter Tabs & Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(
            [
              { key: "all", label: "All Bills" },
              { key: "active", label: "Active" },
              { key: "expiring_soon", label: "Expiring Soon" },
              { key: "expired", label: "Expired" },
              { key: "cancelled", label: "Cancelled" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                filter === tab.key
                  ? "bg-ink-900 text-white shadow-2xs"
                  : "text-ink-600 hover:bg-ink-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input
            type="text"
            placeholder="Search E-Way No, Doc, Party, Vehicle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-full text-xs pl-9 pr-3 py-1.5 bg-white"
          />
        </div>
      </div>

      {/* E-Way Bill Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-ink-150 bg-ink-50 text-ink-500">
            <tr>
              <th className="py-3 px-3 font-semibold">E-Way Bill No.</th>
              <th className="py-3 px-3 font-semibold">Doc Details</th>
              <th className="py-3 px-3 font-semibold">Consignee</th>
              <th className="py-3 px-3 font-semibold">Vehicle & Mode</th>
              <th className="py-3 px-3 font-semibold text-right">Value (₹)</th>
              <th className="py-3 px-3 font-semibold text-center">Validity Status</th>
              <th className="py-3 px-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-ink-500">
                  <Truck className="mx-auto h-8 w-8 text-ink-300 mb-2" />
                  <p className="font-medium text-ink-800">No E-Way Bills found</p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    Generate an E-Way Bill from B2B sales invoices or stock transfers over ₹50,000.
                  </p>
                  <div className="mt-3 flex items-center justify-center gap-2">
                    <Link
                      href="/dashboard/gst/e-invoice"
                      className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
                    >
                      Go to E-Invoice Hub <ArrowRight className="h-3 w-3" />
                    </Link>
                    <Link
                      href="/dashboard/inventory/transfers"
                      className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-200 transition-colors"
                    >
                      Inter-Store Transfers <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const vStat = getValidityStatus(item);
                return (
                  <tr key={item.id} className="hover:bg-ink-50/60 transition-colors">
                    <td className="py-3 px-3 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-ink-900">{item.eWayBillNo}</span>
                        <button
                          onClick={() => copyToClipboard(item.eWayBillNo || "")}
                          title="Copy E-Way Bill No."
                          className="text-ink-400 hover:text-ink-600 transition-colors"
                        >
                          {copiedEwb === item.eWayBillNo ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                      <div className="text-[11px] text-ink-400">
                        {item.eWayBillDate ? new Date(item.eWayBillDate).toLocaleDateString("en-IN") : "-"}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-medium text-ink-900">{item.docNo}</div>
                      <div className="text-[11px] text-ink-500 capitalize">
                        {item.docType.replace("_", " ")} {item.refType ? `(${item.refType})` : ""}
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-medium text-ink-900 line-clamp-1 max-w-[180px]">
                        {item.partyName || "Direct Delivery"}
                      </div>
                      <div className="font-mono text-[11px] text-ink-500">{item.partyGstin || "URP / Consumer"}</div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-mono font-medium text-ink-900">
                        {item.vehicleNo || <span className="text-amber-600 font-sans italic">Part-A Only</span>}
                      </div>
                      <div className="text-[11px] text-ink-500">
                        {item.transportMode === "1" ? "Road" : item.transportMode === "2" ? "Rail" : item.transportMode === "3" ? "Air" : "Road"}
                        {item.distanceKm ? ` · ${item.distanceKm} km` : ""}
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-medium text-ink-900">
                      {formatINR(item.total || 0)}
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${vStat.badge}`}>
                        {vStat.label}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {item.status !== "cancelled" && (
                          <button
                            onClick={() => onOpenUpdate(item)}
                            title="Update Part-B Vehicle"
                            className="btn btn-secondary btn-xs p-1 text-ink-600 hover:text-brand-700"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}

                        <button
                          onClick={() => window.open(`/api/gst/e-way-bill/${item.id}/print`, "_blank")}
                          title="Print Official Inspection Slip"
                          className="btn btn-secondary btn-xs p-1 text-ink-600 hover:text-brand-700"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>

                        {vStat.canCancel && item.status !== "cancelled" && (
                          <button
                            onClick={() => onOpenCancel(item)}
                            title="Statutory Cancel within 24h"
                            className="btn btn-secondary btn-xs p-1 text-rose-600 hover:bg-rose-50 border-rose-200"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

