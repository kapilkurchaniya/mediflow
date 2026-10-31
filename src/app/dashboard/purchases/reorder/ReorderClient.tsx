"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { formatINR } from "@/lib/money";
import {
  Boxes,
  Truck,
  ShoppingCart,
  Search,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  Building2,
  AlertCircle,
} from "lucide-react";
import { getReorderSuggestions, createPoFromReorderAction } from "@/app/actions/reorder";
import type { ReorderSuggestionsReport } from "@/server/domain/purchasing/reorder";

interface StoreOption {
  id: string;
  name: string;
  code: string;
}

interface ReorderClientProps {
  initialReport: ReorderSuggestionsReport;
  stores: StoreOption[];
  currentStoreId: string;
}

export function ReorderClient({
  initialReport,
  stores,
  currentStoreId,
}: ReorderClientProps) {
  const [report, setReport] = useState<ReorderSuggestionsReport>(initialReport);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(currentStoreId);
  const [search, setSearch] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [creatingPoSupplierId, setCreatingPoSupplierId] = useState<string | null>(null);
  const [createdPoNotice, setCreatedPoNotice] = useState<{ poNo: string; id: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRefresh = (storeId: string, q: string) => {
    startTransition(async () => {
      try {
        const res = await getReorderSuggestions(storeId, { search: q || undefined });
        setReport(res);
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to load reorder suggestions");
      }
    });
  };

  const handleCreatePo = (supplierId: string) => {
    if (supplierId === "unassigned") {
      alert("Cannot create automated PO for unassigned items. Please assign a supplier first.");
      return;
    }

    const group = report.suppliers.find((s) => s.supplierId === supplierId);
    if (!group || group.items.length === 0) return;

    setCreatingPoSupplierId(supplierId);
    setErrorMessage(null);
    setCreatedPoNotice(null);

    startTransition(async () => {
      try {
        const res = await createPoFromReorderAction({
          supplierId,
          storeId: selectedStoreId,
          notes: `Automated reorder PO for ${group.items.length} items (${report.storeName})`,
          items: group.items.map((i) => ({
            medicineId: i.medicineId,
            qty: i.suggestedPacks,
            rate: i.lastPurchaseRatePaise,
            freeQty: 0,
          })),
        });

        if (res?.data) {
          setCreatedPoNotice({ poNo: res.data.poNo, id: res.data.id });
          // Refresh list to exclude ordered items
          const updated = await getReorderSuggestions(selectedStoreId, { search });
          setReport(updated);
        } else if (res?.serverError) {
          setErrorMessage(res.serverError);
        }
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : "Error creating purchase order");
      } finally {
        setCreatingPoSupplierId(null);
      }
    });
  };

  return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-teal-700 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Procurement Intelligence (Task B3.2)
          </div>
          <h1 className="text-2xl font-bold text-ink-900 mt-1">Reorder Suggestions Engine</h1>
          <p className="text-xs text-ink-500 mt-0.5">
            Algorithmic replenishment calculating 30-day dispensing velocity, supplier lead time, and safety buffer.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/dashboard/purchases/orders" className="btn btn-secondary btn-sm">
            View All POs
          </Link>
          <Link href="/dashboard/purchases/orders/central" className="btn btn-primary btn-sm flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Central Purchasing
          </Link>
        </div>
      </div>

      {/* Notifications */}
      {createdPoNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-emerald-900">
                Purchase Order {createdPoNotice.poNo} created successfully!
              </div>
              <div className="text-xs text-emerald-700">
                Draft PO is ready for manager review and approval.
              </div>
            </div>
          </div>
          <Link
            href={`/dashboard/purchases/orders/${createdPoNotice.id}`}
            className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex items-center gap-1"
          >
            Review PO <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-800 text-sm">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="card p-4 bg-white border border-ink-100 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {stores.length > 1 && (
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-ink-400" />
              <label htmlFor="store-select" className="text-xs font-semibold text-ink-600">Store:</label>
              <select
                id="store-select"
                value={selectedStoreId}
                onChange={(e) => {
                  setSelectedStoreId(e.target.value);
                  handleRefresh(e.target.value, search);
                }}
                className="select select-sm text-sm border-ink-200"
                disabled={isPending}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="relative">
            <Search className="h-4 w-4 text-ink-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search medicine name or generic..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                handleRefresh(selectedStoreId, e.target.value);
              }}
              className="input input-sm pl-9 text-xs border-ink-200 w-64"
            />
          </div>
        </div>

        <div className="text-xs text-ink-500 flex items-center gap-2">
          <span>Formula:</span>
          <code className="bg-ink-50 px-2 py-0.5 rounded text-[11px] font-mono border border-ink-200 text-ink-700">
            ceil(avgDaily × (leadTime + 7)) + reorderLevel − onHand − onOrder
          </code>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4 bg-white border border-ink-100 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">Medicines Checked</span>
            <Boxes className="h-4 w-4 text-ink-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-900">{report.totalMedicinesEvaluated}</div>
          <div className="mt-1 text-xs text-ink-500">Active catalog items</div>
        </div>

        <div className="card p-4 bg-white border border-ink-100 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">Reorder Needed</span>
            <ShoppingCart className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{report.totalSuggestionsCount} SKUs</div>
          <div className="mt-1 text-xs text-amber-700">Below safety threshold</div>
        </div>

        <div className="card p-4 bg-white border border-ink-100 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">Estimated PO Value</span>
            <span className="text-xs font-bold text-emerald-600">₹</span>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">{formatINR(report.totalEstimatedCostPaise)}</div>
          <div className="mt-1 text-xs text-ink-500">Based on last GRN rates</div>
        </div>

        <div className="card p-4 bg-white border border-ink-100 shadow-sm rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-ink-500 uppercase tracking-wider">Suppliers Involved</span>
            <Truck className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-900">{report.suppliers.length}</div>
          <div className="mt-1 text-xs text-ink-500">Grouped for 1-click POs</div>
        </div>
      </div>

      {/* Supplier Groups */}
      {report.suppliers.length === 0 ? (
        <div className="card bg-white p-12 text-center rounded-xl border border-ink-100 shadow-sm">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
          <h3 className="text-base font-semibold text-ink-900 mt-4">All Inventory Levels Are Healthy!</h3>
          <p className="text-xs text-ink-500 max-w-md mx-auto mt-1">
            No medicines in {report.storeName} currently breach safety stock or reorder levels based on 30-day velocity.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {report.suppliers.map((group) => {
            const isUnassigned = group.supplierId === "unassigned";
            const isSubmitting = creatingPoSupplierId === group.supplierId;

            return (
              <div
                key={group.supplierId}
                className="card bg-white border border-ink-100 rounded-xl shadow-sm overflow-hidden"
              >
                <div className="p-4 bg-ink-50/70 border-b border-ink-100 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                      <Truck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-ink-900 flex items-center gap-2">
                        <span>{group.supplierName}</span>
                        {!isUnassigned && (
                          <span className="text-[11px] font-normal text-ink-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Lead Time: {group.leadTimeDays} days
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-500">
                        {group.totalSuggestedItems} {group.totalSuggestedItems === 1 ? "medicine" : "medicines"} to order · Estimated:{" "}
                        <span className="font-semibold text-ink-900">{formatINR(group.totalEstimatedCostPaise)}</span>
                      </div>
                    </div>
                  </div>

                  {!isUnassigned ? (
                    <button
                      type="button"
                      onClick={() => handleCreatePo(group.supplierId)}
                      disabled={isSubmitting || isPending}
                      className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      {isSubmitting ? "Generating Draft PO..." : `Create Draft PO (${group.totalSuggestedItems})`}
                    </button>
                  ) : (
                    <span className="text-xs text-amber-700 font-medium bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                      Requires manual vendor assignment
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white border-b border-ink-100 text-ink-500 font-medium">
                      <tr>
                        <th className="py-2.5 px-4">Medicine Name</th>
                        <th className="py-2.5 px-4 text-center">Packaging</th>
                        <th className="py-2.5 px-4 text-right">On Hand</th>
                        <th className="py-2.5 px-4 text-right">30-Day Avg/Day</th>
                        <th className="py-2.5 px-4 text-right">On Order</th>
                        <th className="py-2.5 px-4 text-right">Reorder Level</th>
                        <th className="py-2.5 px-4 text-right">Suggested Qty</th>
                        <th className="py-2.5 px-4 text-right">Pack Rate</th>
                        <th className="py-2.5 px-4 text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {group.items.map((item) => (
                        <tr key={item.medicineId} className="hover:bg-ink-50/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-ink-900">{item.medicineName}</div>
                            {item.genericName && (
                              <div className="text-[11px] text-ink-400">{item.genericName}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="badge badge-neutral text-[11px]">
                              1 {item.packUnit} = {item.unitsPerPack} {item.looseUnit}s
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-medium">
                            <span className={item.onHand === 0 ? "text-rose-600 font-bold" : "text-ink-700"}>
                              {item.onHand} {item.looseUnit}s
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-ink-600">
                            {item.avgDailySales} /day
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-ink-500">
                            {item.onOrder > 0 ? `${item.onOrder} ${item.looseUnit}s` : "—"}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-ink-500">
                            {item.reorderLevel} {item.looseUnit}s
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-teal-700">
                            <span className="bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                              {item.suggestedPacks} {item.packUnit}s ({item.suggestedQty} {item.looseUnit}s)
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-ink-600">
                            {item.lastPurchaseRatePaise > 0 ? formatINR(item.lastPurchaseRatePaise) : "—"}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-ink-900">
                            {formatINR(item.estimatedCostPaise)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

