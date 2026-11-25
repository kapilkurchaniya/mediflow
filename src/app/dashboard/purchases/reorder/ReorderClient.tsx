"use client";

import React, { useState, useTransition, useRef, useEffect, useMemo } from "react";
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
import { QuickRegisterSupplierModal } from "@/app/components/QuickRegisterSupplierModal";
import { buildDraftKey, useFormDraft } from "@/lib/useFormDraft";

interface StoreOption {
  id: string;
  name: string;
  code: string;
}

interface ReorderClientProps {
  initialReport: ReorderSuggestionsReport;
  stores: StoreOption[];
  currentStoreId: string;
  canCreatePo?: boolean;
}

export function ReorderClient({
  initialReport,
  stores,
  currentStoreId,
  canCreatePo = true,
}: ReorderClientProps) {
  const [report, setReport] = useState<ReorderSuggestionsReport>(initialReport);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(currentStoreId);
  const [search, setSearch] = useState<string>("");
  const [includeNeverStocked, setIncludeNeverStocked] = useState<boolean>(false);
  const [isPending, startTransition] = useTransition();
  const [creatingPoSupplierId, setCreatingPoSupplierId] = useState<string | null>(null);
  const [createdPoNotice, setCreatedPoNotice] = useState<{ poNo: string; id: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    value: packQtyOverrides,
    setValue: setPackQtyOverrides,
    clearDraft: clearQtyDraft,
  } = useFormDraft<Record<string, number>>(
    buildDraftKey("reorder-qty", currentStoreId),
    {},
    { isEmpty: (v) => Object.keys(v).length === 0 }
  );
  const [unassignedSupplierId, setUnassignedSupplierId] = useState<string>("");
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
  const requestSeqRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchReport = (storeId: string, q: string, includeUnstocked: boolean) => {
    const seq = ++requestSeqRef.current;
    startTransition(async () => {
      try {
        const res = await getReorderSuggestions(storeId, {
          search: q.trim() || undefined,
          includeNeverStocked: includeUnstocked,
        });
        if (seq === requestSeqRef.current) {
          setReport(res);
        }
      } catch (err: unknown) {
        if (seq === requestSeqRef.current) {
          setErrorMessage(err instanceof Error ? err.message : "Failed to load reorder suggestions");
        }
      }
    });
  };

  const liveTotalCostPaise = useMemo(() => {
    let sum = 0;
    for (const g of report.suppliers) {
      for (const item of g.items) {
        const packs = packQtyOverrides[item.medicineId] ?? item.suggestedPacks;
        sum += packs * item.lastPurchaseRatePaise;
      }
    }
    return sum;
  }, [report.suppliers, packQtyOverrides]);

  const handleCreatePo = (groupKey: string, overrideTargetSupplierId?: string) => {
    const targetSupplierId = overrideTargetSupplierId || groupKey;
    if (!targetSupplierId || targetSupplierId === "unassigned") {
      setErrorMessage("Please select a supplier before creating a Draft PO.");
      return;
    }

    const group = report.suppliers.find((s) => s.supplierId === groupKey);
    if (!group || group.items.length === 0) return;

    setCreatingPoSupplierId(groupKey);
    setErrorMessage(null);
    setCreatedPoNotice(null);

    startTransition(async () => {
      try {
        const res = await createPoFromReorderAction({
          supplierId: targetSupplierId,
          storeId: selectedStoreId,
          notes: `Automated reorder PO for ${group.items.length} items (${report.storeName})`,
          items: group.items.map((i) => {
            const packs = packQtyOverrides[i.medicineId] ?? i.suggestedPacks;
            return {
              medicineId: i.medicineId,
              qty: Math.max(1, packs),
              rate: i.lastPurchaseRatePaise,
              freeQty: 0,
            };
          }),
        });

        if (res?.data) {
          setCreatedPoNotice({ poNo: res.data.poNo, id: res.data.id });
          clearQtyDraft({});
          const updated = await getReorderSuggestions(selectedStoreId, {
            search: search.trim() || undefined,
            includeNeverStocked,
          });
          setReport(updated);
        } else if (res?.serverError) {
          setErrorMessage(res.serverError);
        } else if (res?.validationErrors) {
          setErrorMessage("Please check item quantities and supplier selection.");
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
            Procurement Intelligence
          </div>
          <h1 className="text-2xl font-bold text-ink-900 mt-1">Reorder Suggestions Engine</h1>
          <p className="text-xs text-ink-500 mt-0.5">
            Algorithmic replenishment calculating 30-day dispensing velocity, branch thresholds, supplier lead time, and pipeline stock.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/purchases/orders"
            className="btn btn-secondary btn-sm"
            data-tooltip="View all draft, sent, and received supplier Purchase Orders"
          >
            View All POs
          </Link>
          <Link
            href="/dashboard/purchases/orders/central"
            className="btn btn-primary btn-sm flex items-center gap-1.5"
            data-tooltip="Create multi-branch split Purchase Orders from the central warehouse"
          >
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
                  const nextStore = e.target.value;
                  setSelectedStoreId(nextStore);
                  setPackQtyOverrides({});
                  setCreatedPoNotice(null);
                  setErrorMessage(null);
                  fetchReport(nextStore, search, includeNeverStocked);
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
                const nextQ = e.target.value;
                setSearch(nextQ);
                if (debounceRef.current) clearTimeout(debounceRef.current);
                debounceRef.current = setTimeout(() => {
                  fetchReport(selectedStoreId, nextQ, includeNeverStocked);
                }, 300);
              }}
              className="input input-sm pl-9 text-xs border-ink-200 w-64"
            />
          </div>

          <label className="inline-flex items-center gap-1.5 text-xs text-ink-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeNeverStocked}
              onChange={(e) => {
                const nextVal = e.target.checked;
                setIncludeNeverStocked(nextVal);
                fetchReport(selectedStoreId, search, nextVal);
              }}
              className="rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            />
            <span>Include never-stocked catalog items</span>
          </label>
        </div>

        <div className="text-xs text-ink-500 flex items-center gap-2">
          <span>Formula:</span>
          <code className="bg-ink-50 px-2 py-0.5 rounded text-[11px] font-mono border border-ink-200 text-ink-700">
            ceil(avgDaily × (leadTime + 7)) + reorderLevel − onHand − onOrder − inTransit
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
          <div className="mt-2 text-2xl font-bold text-emerald-700">{formatINR(liveTotalCostPaise)}</div>
          <div className="mt-1 text-xs text-ink-500">Based on last GRN / batch rates</div>
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
            No stocked medicines in {report.storeName} currently breach safety stock or reorder levels based on 30-day velocity.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {report.suppliers.map((group) => {
            const isUnassigned = group.supplierId === "unassigned";
            const isSubmitting = creatingPoSupplierId === group.supplierId;
            const groupLiveTotal = group.items.reduce(
              (sum, i) => sum + (packQtyOverrides[i.medicineId] ?? i.suggestedPacks) * i.lastPurchaseRatePaise,
              0
            );

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
                            {group.phone ? ` · ${group.phone}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-500">
                        {group.totalSuggestedItems} {group.totalSuggestedItems === 1 ? "medicine" : "medicines"} to order · Estimated:{" "}
                        <span className="font-semibold text-ink-900">{formatINR(groupLiveTotal)}</span>
                      </div>
                    </div>
                  </div>

                  {canCreatePo && (!isUnassigned ? (
                    <button
                      type="button"
                      onClick={() => handleCreatePo(group.supplierId)}
                      disabled={isSubmitting || isPending}
                      className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      {isSubmitting ? "Generating Draft PO..." : `Create Draft PO (${group.totalSuggestedItems})`}
                    </button>
                  ) : report.activeSuppliers.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={unassignedSupplierId}
                        onChange={(e) => setUnassignedSupplierId(e.target.value)}
                        className="select select-sm text-xs border-ink-200"
                        aria-label="Assign supplier for unassigned items"
                      >
                        <option value="">-- Assign Supplier --</option>
                        {report.activeSuppliers.map((sup) => (
                          <option key={sup.id} value={sup.id}>
                            {sup.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleCreatePo("unassigned", unassignedSupplierId)}
                        disabled={!unassignedSupplierId || isSubmitting || isPending}
                        className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        {isSubmitting ? "Generating..." : `Create Draft PO (${group.totalSuggestedItems})`}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAddSupplierOpen(true)}
                      className="btn btn-secondary btn-sm text-amber-800 border-amber-300 bg-amber-50 hover:bg-amber-100"
                    >
                      + Add Supplier to Create PO
                    </button>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white border-b border-ink-100 text-ink-500 font-medium">
                      <tr>
                        <th className="py-2.5 px-4">Medicine Name</th>
                        <th className="py-2.5 px-4 text-center">Packaging</th>
                        <th className="py-2.5 px-4 text-right">On Hand</th>
                        <th className="py-2.5 px-4 text-right">30-Day Avg/Day</th>
                        <th className="py-2.5 px-4 text-right">Pipeline (PO / Transit)</th>
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
                            {item.onOrder > 0 || item.inTransit > 0 ? (
                              <span>
                                {item.onOrder > 0 ? `${item.onOrder} PO` : ""}
                                {item.onOrder > 0 && item.inTransit > 0 ? " · " : ""}
                                {item.inTransit > 0 ? `${item.inTransit} Transit` : ""}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-ink-500">
                            {item.reorderLevel} {item.looseUnit}s
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                type="number"
                                min="1"
                                value={packQtyOverrides[item.medicineId] ?? item.suggestedPacks}
                                onChange={(e) => {
                                  const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                                  setPackQtyOverrides((prev) => ({ ...prev, [item.medicineId]: val }));
                                }}
                                className="input !py-0.5 !px-2 !w-16 text-right font-mono font-bold text-xs"
                                title="Adjust commercial packaging boxes/packs"
                              />
                              <span className="text-[11.5px] text-ink-600 font-medium whitespace-nowrap">
                                {item.packUnit}s
                              </span>
                            </div>
                            <div className="text-[10.5px] font-mono text-ink-400 text-right mt-0.5">
                              = {(packQtyOverrides[item.medicineId] ?? item.suggestedPacks) * item.unitsPerPack} {item.looseUnit}s
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-ink-600">
                            {item.lastPurchaseRatePaise > 0 ? formatINR(item.lastPurchaseRatePaise) : "Rate TBD"}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold text-ink-900">
                            {formatINR((packQtyOverrides[item.medicineId] ?? item.suggestedPacks) * item.lastPurchaseRatePaise)}
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

      <QuickRegisterSupplierModal
        isOpen={isAddSupplierOpen}
        onClose={() => setIsAddSupplierOpen(false)}
        initialMeta={{ name: "", gstin: null, phone: null, drugLicenseNo: null, address: null }}
        title="Quick Add Supplier"
        subtitle="Add a distributor without losing your reorder quantities."
        onRegistered={(sup) => {
          setReport((prev) => ({
            ...prev,
            activeSuppliers: [
              { id: sup.id, name: sup.name, phone: null, leadTimeDays: 2 },
              ...prev.activeSuppliers.filter((s) => s.id !== sup.id),
            ],
          }));
          setUnassignedSupplierId(sup.id);
        }}
      />
    </div>
  );
}
