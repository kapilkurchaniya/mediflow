"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Tag,
  Plus,
  Percent,
  Gift,
  Coins,
  Layers,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Calendar,
} from "lucide-react";
import { toggleSchemeStatus, deleteScheme } from "@/app/actions/schemes";
import { formatINR } from "@/lib/money";

interface SchemeItem {
  scheme: {
    id: string;
    name: string;
    schemeType: string;
    buyQty: number;
    freeQty: number;
    discountBp: number;
    flatDiscount: number;
    minQty: number;
    validFrom: string | null;
    validTo: string | null;
    isActive: boolean;
    createdAt: Date;
  };
  medicineName: string | null;
  supplierName: string | null;
  categoryName: string | null;
}

export function SchemesListClient({ initialSchemes }: { initialSchemes: SchemeItem[] }) {
  const [schemes, setSchemes] = useState(initialSchemes);
  const [filterType, setFilterType] = useState<string>("all");

  const filtered = schemes.filter((s) => {
    if (filterType === "all") return true;
    return s.scheme.schemeType === filterType;
  });

  async function handleToggle(id: string, currentStatus: boolean) {
    const nextStatus = !currentStatus;
    setSchemes((prev) =>
      prev.map((s) => (s.scheme.id === id ? { ...s, scheme: { ...s.scheme, isActive: nextStatus } } : s))
    );
    await toggleSchemeStatus(id, nextStatus);
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete scheme '${name}'?`)) return;
    setSchemes((prev) => prev.filter((s) => s.scheme.id !== id));
    await deleteScheme(id);
  }

  function getSchemeBadge(type: string) {
    switch (type) {
      case "free_qty":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
            <Gift className="h-3 w-3" /> Buy X Get Y
          </span>
        );
      case "percentage":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-100 text-sky-800">
            <Percent className="h-3 w-3" /> Percentage
          </span>
        );
      case "flat":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800">
            <Coins className="h-3 w-3" /> Flat Off
          </span>
        );
      case "tiered":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
            <Layers className="h-3 w-3" /> Tiered Bonus
          </span>
        );
      default:
        return <span className="text-xs text-ink-600">{type}</span>;
    }
  }

  function formatTerms(scheme: SchemeItem["scheme"]) {
    if (scheme.schemeType === "free_qty") {
      return `Buy ${scheme.buyQty} + Get ${scheme.freeQty} Free (Min: ${scheme.minQty})`;
    }
    if (scheme.schemeType === "percentage") {
      return `${(scheme.discountBp / 100).toFixed(1)}% Discount (Min Qty: ${scheme.minQty})`;
    }
    if (scheme.schemeType === "flat") {
      return `Flat ${formatINR(scheme.flatDiscount)} Off (Min Qty: ${scheme.minQty})`;
    }
    if (scheme.schemeType === "tiered") {
      return `Buy ${scheme.buyQty} Get ${scheme.freeQty} Free + ${(scheme.discountBp / 100).toFixed(1)}% Off`;
    }
    return "Standard";
  }

  return (
    <div className="space-y-4">
      {/* Filters & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-150 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterType === "all" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            All Schemes ({schemes.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("free_qty")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterType === "free_qty" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            Buy X Get Y ({schemes.filter((s) => s.scheme.schemeType === "free_qty").length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("percentage")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterType === "percentage" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            Percentage ({schemes.filter((s) => s.scheme.schemeType === "percentage").length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("flat")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterType === "flat" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            Flat Off ({schemes.filter((s) => s.scheme.schemeType === "flat").length})
          </button>
        </div>

        <Link
          href="/dashboard/settings/schemes/new"
          className="btn btn-primary text-xs shrink-0 self-start sm:self-auto"
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Create Scheme
        </Link>
      </div>

      {/* Schemes Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table w-full text-xs">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                <th className="py-2.5 px-4">Scheme Name</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Applicability</th>
                <th className="py-2.5 px-4">Terms</th>
                <th className="py-2.5 px-4">Validity</th>
                <th className="py-2.5 px-4 text-center">Status</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-ink-400">
                    No trade schemes created yet. Click "+ Create Scheme" to configure distributor or retail offers.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const s = item.scheme;
                  return (
                    <tr key={s.id} className="hover:bg-ink-50/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-ink-900 whitespace-nowrap">
                        {s.name}
                      </td>
                      <td className="py-3 px-4">{getSchemeBadge(s.schemeType)}</td>
                      <td className="py-3 px-4 text-ink-700">
                        {item.medicineName ? (
                          <span className="font-medium text-brand-700">Item: {item.medicineName}</span>
                        ) : item.categoryName ? (
                          <span>Category: {item.categoryName}</span>
                        ) : item.supplierName ? (
                          <span>Supplier: {item.supplierName}</span>
                        ) : (
                          <span className="text-ink-500 italic">Store-wide (All Items)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-ink-900">
                        {formatTerms(s)}
                      </td>
                      <td className="py-3 px-4 text-ink-600 whitespace-nowrap">
                        {s.validFrom || s.validTo ? (
                          <span className="flex items-center gap-1 text-[11px]">
                            <Calendar className="h-3 w-3 text-ink-400" />
                            {s.validFrom || "Start"} → {s.validTo || "Indefinite"}
                          </span>
                        ) : (
                          <span className="text-[11px] text-ink-400">Permanent / Ongoing</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggle(s.id, s.isActive)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                            s.isActive
                              ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                              : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                          }`}
                        >
                          {s.isActive ? (
                            <>
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </>
                          ) : (
                            <>
                              <AlertCircle className="h-3 w-3" /> Paused
                            </>
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id, s.name)}
                          className="btn btn-ghost text-xs text-red-600 hover:bg-red-50 p-1"
                          title="Delete Scheme"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
