"use client";

import React, { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { formatINR } from "@/lib/money";
import {
  Building2,
  Boxes,
  Truck,
  ShoppingCart,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  ArrowRight,
  FileText,
} from "lucide-react";
import {
  createCentralSplitPoAction,
  searchMedicinesForCentralPo,
  type CentralPurchasingSupplierOption,
  type CentralPurchasingStoreOption,
  type CentralPurchasingMedicineItem,
} from "@/app/actions/central-purchasing";
import {
  calculateCentralPoMatrix,
  type CentralSplitPoResult,
} from "@/lib/purchasing/central-po";
import { QuickRegisterSupplierModal } from "@/app/components/QuickRegisterSupplierModal";
import { buildDraftKey, useFormDraft } from "@/lib/useFormDraft";

interface MatrixRowItem {
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  packUnit: string;
  looseUnit: string;
  unitsPerPack: number;
  rateRupees: number; // in rupees for input
  allocations: Record<string, number>; // storeId -> quantity
}

interface CentralPoClientProps {
  initialSuppliers: CentralPurchasingSupplierOption[];
  stores: CentralPurchasingStoreOption[];
  initialMedicines: CentralPurchasingMedicineItem[];
}

export function CentralPoClient({
  initialSuppliers,
  stores,
  initialMedicines,
}: CentralPoClientProps) {
  const [suppliers, setSuppliers] = useState<CentralPurchasingSupplierOption[]>(initialSuppliers);
  const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);

  const defaultRows = useMemo<MatrixRowItem[]>(() => {
    if (initialMedicines.length > 0) {
      return initialMedicines.slice(0, 3).map((m) => {
        const allocs: Record<string, number> = {};
        stores.forEach((s) => {
          allocs[s.id] = 0;
        });
        return {
          medicineId: m.id,
          medicineName: m.name,
          genericName: m.genericName,
          packUnit: m.packUnit,
          looseUnit: m.looseUnit,
          unitsPerPack: m.unitsPerPack,
          rateRupees: 100,
          allocations: allocs,
        };
      });
    }
    return [];
  }, [initialMedicines, stores]);

  const {
    value: draft,
    setValue: setDraft,
    hasRestoredDraft,
    clearDraft,
    dismissRestoredNotice,
  } = useFormDraft(
    buildDraftKey("central-po"),
    {
      supplierId: initialSuppliers[0]?.id || "",
      expectedDate: "",
      notes: "",
      rows: defaultRows,
    },
    {
      isEmpty: (d) =>
        !d.notes &&
        !d.expectedDate &&
        d.rows.length === defaultRows.length &&
        d.rows.every((r) => Object.values(r.allocations).every((q) => !q)),
    }
  );

  const { supplierId, expectedDate, notes, rows } = draft;
  const setSupplierId = (val: string) =>
    setDraft((prev) => ({ ...prev, supplierId: val }));
  const setExpectedDate = (val: string) =>
    setDraft((prev) => ({ ...prev, expectedDate: val }));
  const setNotes = (val: string) =>
    setDraft((prev) => ({ ...prev, notes: val }));
  const setRows = (updater: MatrixRowItem[] | ((prev: MatrixRowItem[]) => MatrixRowItem[])) =>
    setDraft((prev) => ({
      ...prev,
      rows: typeof updater === "function" ? updater(prev.rows) : updater,
    }));

  // Medicine search & selector
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<CentralPurchasingMedicineItem[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);

  const [isPending, startTransition] = useTransition();
  const [createdResult, setCreatedResult] = useState<CentralSplitPoResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId),
    [suppliers, supplierId]
  );

  // Compute live matrix calculations
  const matrixInput = useMemo(
    () =>
      rows.map((r) => ({
        medicineId: r.medicineId,
        rate: Math.round(r.rateRupees * 100), // convert to paise
        allocations: stores.map((s) => ({
          storeId: s.id,
          qty: r.allocations[s.id] || 0,
          freeQty: 0,
        })),
      })),
    [rows, stores]
  );

  const summary = useMemo(
    () => calculateCentralPoMatrix(matrixInput),
    [matrixInput]
  );

  const handleSearchMedicines = async (q: string) => {
    setSearchQuery(q);
    if (!q || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchMedicinesForCentralPo(q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddMedicine = (med: CentralPurchasingMedicineItem) => {
    if (rows.some((r) => r.medicineId === med.id)) {
      setSearchQuery("");
      setSearchResults([]);
      return;
    }

    const allocs: Record<string, number> = {};
    stores.forEach((s) => {
      allocs[s.id] = 0;
    });

    setRows((prev) => [
      ...prev,
      {
        medicineId: med.id,
        medicineName: med.name,
        genericName: med.genericName,
        packUnit: med.packUnit,
        looseUnit: med.looseUnit,
        unitsPerPack: med.unitsPerPack,
        rateRupees: 100,
        allocations: allocs,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
  };

  const handleRemoveRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRateChange = (index: number, newRate: number) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index].rateRupees = Math.max(0, newRate);
      return copy;
    });
  };

  const handleQtyChange = (rowIndex: number, storeId: string, qty: number) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[rowIndex].allocations = {
        ...copy[rowIndex].allocations,
        [storeId]: Math.max(0, qty),
      };
      return copy;
    });
  };

  const handleSubmit = () => {
    if (!supplierId) {
      setErrorMessage("Please select a supplier");
      return;
    }

    if (summary.totalQuantity <= 0) {
      setErrorMessage("Please enter quantities greater than 0 for at least one branch");
      return;
    }

    setErrorMessage(null);
    setCreatedResult(null);

    startTransition(async () => {
      try {
        const payload = {
          supplierId,
          expectedDate: expectedDate || undefined,
          notes: notes.trim() || undefined,
          items: rows
            .map((r) => ({
              medicineId: r.medicineId,
              rate: Math.round(r.rateRupees * 100),
              allocations: stores
                .map((s) => ({
                  storeId: s.id,
                  qty: r.allocations[s.id] || 0,
                  freeQty: 0,
                }))
                .filter((a) => a.qty > 0),
            }))
            .filter((item) => item.allocations.length > 0),
        };

        const res = await createCentralSplitPoAction(payload);
        if (res?.data) {
          setCreatedResult(res.data);
          // Reset matrix allocations & clear draft after success
          const resetRows = rows.map((r) => {
            const resetAllocs: Record<string, number> = {};
            stores.forEach((s) => {
              resetAllocs[s.id] = 0;
            });
            return { ...r, allocations: resetAllocs };
          });
          clearDraft({
            supplierId,
            expectedDate: "",
            notes: "",
            rows: resetRows,
          });
        } else if (res?.serverError) {
          setErrorMessage(res.serverError);
        }
      } catch (err: unknown) {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to create central split purchase orders"
        );
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Link
              href="/dashboard/purchases/orders"
              className="hover:text-slate-900 transition-colors"
            >
              Purchases
            </Link>
            <span>/</span>
            <span>Orders</span>
            <span>/</span>
            <span className="text-slate-900 font-semibold">Central Multi-Branch PO</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Layers className="h-6 w-6 text-teal-600" />
            Central Purchasing & Split Matrix
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Order in bulk from a single supplier and split shipment quantities across your pharmacy branches.
            Generates distinct, trackable child POs for each destination store.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/purchases/reorder"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Boxes className="h-4 w-4 text-slate-500" />
            Reorder Engine
          </Link>
          <Link
            href="/dashboard/purchases/orders"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            All Orders
          </Link>
        </div>
      </div>

      {/* Success Notification */}
      {createdResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-3 flex-1">
              <div>
                <h3 className="text-base font-semibold text-emerald-900">
                  Split Purchase Orders Generated Successfully!
                </h3>
                <p className="text-sm text-emerald-700 mt-0.5">
                  Supplier: <span className="font-semibold">{createdResult.supplierName}</span> · Total Order Value:{" "}
                  <span className="font-bold">{formatINR(createdResult.totalEstimatedPaise)}</span> across{" "}
                  <span className="font-semibold">{createdResult.totalStores} branches</span>.
                </p>
              </div>

              {/* Child orders grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {createdResult.createdOrders.map((ord) => (
                  <div
                    key={ord.poId}
                    className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white p-3 shadow-xs"
                  >
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {ord.storeName} ({ord.storeCode})
                      </div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">
                        {ord.poNo}
                      </div>
                      <div className="text-xs text-slate-600">
                        {ord.itemCount} item(s) · {formatINR(ord.estimatedTotalPaise)}
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/purchases/orders/${ord.poId}`}
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                    >
                      View PO
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draft Restored Banner */}
      {hasRestoredDraft && (
        <div className="rounded-lg border border-brand-200 bg-brand-50/70 px-4 py-2.5 text-xs text-brand-900 flex flex-wrap items-center justify-between gap-2">
          <span>
            Restored your unsaved Central PO draft ({rows.length} medicine{rows.length === 1 ? "" : "s"}).
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                clearDraft({
                  supplierId: suppliers[0]?.id || "",
                  expectedDate: "",
                  notes: "",
                  rows: defaultRows,
                })
              }
              className="font-semibold text-rose-700 hover:underline"
            >
              Discard Draft
            </button>
            <button
              type="button"
              onClick={dismissRestoredNotice}
              className="text-brand-700 hover:underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Execution Error: </span>
            {errorMessage}
          </div>
        </div>
      )}

      {/* Supplier & Header Config */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Truck className="h-4 w-4 text-slate-600" />
          Supplier & Delivery Details
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700">
                Select Supplier <span className="text-rose-500">*</span>
              </label>
              {suppliers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(true)}
                  className="text-[11px] font-semibold text-teal-700 hover:underline"
                >
                  + New Supplier
                </button>
              )}
            </div>
            {suppliers.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
                <p className="font-medium">No active suppliers added yet.</p>
                <button
                  type="button"
                  onClick={() => setIsAddSupplierOpen(true)}
                  className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Supplier
                </button>
              </div>
            ) : (
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.gstin ? `(${s.gstin})` : ""}
                  </option>
                ))}
              </select>
            )}
            {selectedSupplier && (
              <p className="mt-1 text-xs text-slate-500">
                Lead Time: {selectedSupplier.leadTimeDays} days
                {selectedSupplier.phone ? ` · Phone: ${selectedSupplier.phone}` : ""}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Expected Delivery Date
            </label>
            <div className="relative">
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Notes / Central Reference
            </label>
            <input
              type="text"
              placeholder="e.g. Q4 bulk discount, single delivery to main hub"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>
      </div>

      {/* Matrix Controls & Search */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Boxes className="h-4 w-4 text-slate-600" />
              Branch Distribution Matrix ({stores.length} Branches Available)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter expected unit rates and allocate order quantities (in packs) across branches.
            </p>
          </div>

          {/* Autocomplete medicine search */}
          <div className="relative w-full sm:w-80">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search catalog to add medicine..."
                value={searchQuery}
                onChange={(e) => handleSearchMedicines(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-teal-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            {/* Dropdown search results */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {searchResults.map((med) => (
                  <button
                    key={med.id}
                    type="button"
                    onClick={() => handleAddMedicine(med)}
                    className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center justify-between transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{med.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {med.genericName || "Generic"} · {med.unitsPerPack} {med.looseUnit}s/{med.packUnit}
                      </div>
                    </div>
                    <span className="text-[10px] rounded bg-teal-50 px-1.5 py-0.5 font-medium text-teal-700">
                      + Add
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 font-semibold min-w-[200px]">Medicine / Formulation</th>
                <th className="px-3 py-3 font-semibold w-28 text-right">Rate (₹/pack)</th>
                {stores.map((s) => (
                  <th
                    key={s.id}
                    className="px-3 py-3 font-semibold w-28 text-center bg-slate-100/60 border-l border-slate-200"
                  >
                    <div className="truncate max-w-[100px] mx-auto" title={s.name}>
                      {s.code || s.name}
                    </div>
                    <div className="text-[9px] font-normal lowercase text-slate-400">
                      packs
                    </div>
                  </th>
                ))}
                <th className="px-3 py-3 font-semibold w-24 text-center border-l border-slate-200">
                  Total Packs
                </th>
                <th className="px-3 py-3 font-semibold w-28 text-right border-l border-slate-200">
                  Line Total (₹)
                </th>
                <th className="px-2 py-3 w-10 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={stores.length + 5}
                    className="px-4 py-8 text-center text-slate-400"
                  >
                    No medicines in matrix. Use the search bar above to add medicines.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const rowTotalPacks = stores.reduce(
                    (sum, s) => sum + (row.allocations[s.id] || 0),
                    0
                  );
                  const rowLineTotalRupees = rowTotalPacks * row.rateRupees;

                  return (
                    <tr
                      key={row.medicineId}
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{row.medicineName}</div>
                        <div className="text-[11px] text-slate-400">
                          {row.genericName ? `${row.genericName} · ` : ""}
                          {row.unitsPerPack} {row.looseUnit}s per {row.packUnit}
                        </div>
                      </td>

                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.rateRupees}
                          onChange={(e) =>
                            handleRateChange(idx, parseFloat(e.target.value) || 0)
                          }
                          className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-right text-xs font-mono text-slate-900 focus:border-teal-500 focus:outline-none"
                        />
                      </td>

                      {stores.map((s) => (
                        <td
                          key={s.id}
                          className="px-2 py-2.5 text-center bg-slate-50/30 border-l border-slate-100"
                        >
                          <input
                            type="number"
                            min="0"
                            value={row.allocations[s.id] || 0}
                            onChange={(e) =>
                              handleQtyChange(idx, s.id, parseInt(e.target.value, 10) || 0)
                            }
                            className={`w-16 rounded border px-2 py-1 text-center text-xs font-mono focus:outline-none ${
                              (row.allocations[s.id] || 0) > 0
                                ? "border-teal-500 bg-teal-50/50 font-bold text-teal-900"
                                : "border-slate-200 bg-white text-slate-400"
                            }`}
                          />
                        </td>
                      ))}

                      <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-900 border-l border-slate-100">
                        {rowTotalPacks}
                      </td>

                      <td className="px-3 py-2.5 text-right font-mono font-semibold text-slate-900 border-l border-slate-100">
                        {formatINR(Math.round(rowLineTotalRupees * 100))}
                      </td>

                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(idx)}
                          className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                          title="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Matrix Summary Footer */}
            {rows.length > 0 && (
              <tfoot className="bg-slate-50 font-semibold text-slate-900 border-t-2 border-slate-200">
                <tr>
                  <td className="px-3 py-3">Total Allocated Quantities</td>
                  <td className="px-3 py-3 text-right text-slate-400">—</td>
                  {stores.map((s) => {
                    const branchStat = summary.branchTotals[s.id];
                    return (
                      <td
                        key={s.id}
                        className="px-2 py-3 text-center border-l border-slate-200 font-mono"
                      >
                        <div className="text-teal-700">
                          {branchStat?.totalQuantity || 0}
                        </div>
                        <div className="text-[10px] font-normal text-slate-500">
                          {formatINR(branchStat?.totalEstimatedCostPaise || 0)}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center font-mono text-teal-800 border-l border-slate-200">
                    {summary.totalQuantity}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-teal-800 border-l border-slate-200">
                    {formatINR(summary.totalEstimatedCostPaise)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
          {/* Branch summary pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Branches included:</span>
            {stores
              .filter((s) => (summary.branchTotals[s.id]?.totalQuantity || 0) > 0)
              .map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800"
                >
                  <Building2 className="h-3 w-3 text-teal-600" />
                  {s.name}: {summary.branchTotals[s.id]?.totalQuantity} packs (
                  {formatINR(summary.branchTotals[s.id]?.totalEstimatedCostPaise || 0)})
                </span>
              ))}
            {Object.keys(summary.branchTotals).length === 0 && (
              <span className="text-xs italic text-slate-400">None yet</span>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isPending || summary.totalQuantity === 0}
              onClick={handleSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {isPending ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating POs...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Generate {Object.keys(summary.branchTotals).length} Branch Purchase Orders (
                  {formatINR(summary.totalEstimatedCostPaise)})
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <QuickRegisterSupplierModal
        isOpen={isAddSupplierOpen}
        onClose={() => setIsAddSupplierOpen(false)}
        initialMeta={{ name: "", gstin: null, phone: null, drugLicenseNo: null, address: null }}
        title="Quick Add Supplier"
        subtitle="Add a distributor without losing your Central PO medicine matrix."
        onRegistered={(sup) => {
          setSuppliers((prev) => [
            { id: sup.id, name: sup.name, gstin: null, phone: null, leadTimeDays: 2 },
            ...prev.filter((s) => s.id !== sup.id),
          ]);
          setSupplierId(sup.id);
        }}
      />
    </div>
  );
}

