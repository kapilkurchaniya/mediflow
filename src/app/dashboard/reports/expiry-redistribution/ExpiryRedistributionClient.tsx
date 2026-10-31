"use client";

import React, { useState, useTransition } from "react";
import { formatINR, formatNumber } from "@/lib/format";
import {
  type ExpiryRedistributionItem,
  type ExpiryRedistributionReport,
} from "@/server/domain/inventory/expiry-redistribution";
import { createTransferFromRedistributionAction } from "@/app/actions/expiry-redistribution";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Filter,
  IndianRupee,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Store,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

interface Props {
  initialReport: ExpiryRedistributionReport;
  stores: Array<{ id: string; name: string; code: string }>;
  selectedStoreId?: string;
}

export function ExpiryRedistributionClient({
  initialReport,
  stores,
  selectedStoreId: defaultStoreId,
}: Props) {
  const [report, setReport] = useState<ExpiryRedistributionReport>(initialReport);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState(defaultStoreId || "all");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "critical" | "high" | "medium">("all");
  const [activeTransferModal, setActiveTransferModal] = useState<ExpiryRedistributionItem | null>(null);
  const [transferQty, setTransferQty] = useState<number>(0);
  const [transferNotes, setTransferNotes] = useState<string>("");
  const [selectedDestStoreId, setSelectedDestStoreId] = useState<string>("");

  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Filter items in client
  const filteredItems = report.suggestions.filter((item) => {
    if (selectedStoreId !== "all" && item.sourceStoreId !== selectedStoreId) {
      return false;
    }
    if (urgencyFilter !== "all" && item.urgency !== urgencyFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.medicineName.toLowerCase().includes(q);
      const matchGeneric = item.genericName?.toLowerCase().includes(q);
      const matchBatch = item.batchNo.toLowerCase().includes(q);
      const matchStore = item.sourceStoreName.toLowerCase().includes(q);
      if (!matchName && !matchGeneric && !matchBatch && !matchStore) return false;
    }
    return true;
  });

  const handleOpenTransfer = (item: ExpiryRedistributionItem) => {
    setActiveTransferModal(item);
    setTransferQty(item.suggestedTransferQty);
    setSelectedDestStoreId(item.bestDestinationStore?.storeId || "");
    setTransferNotes(
      `Expiry redistribution transfer of ${item.medicineName} (Batch ${item.batchNo}) expiring in ${item.daysToExpiry} days.`
    );
    setStatusMessage(null);
  };

  const handleConfirmTransfer = async () => {
    if (!activeTransferModal || !selectedDestStoreId || transferQty <= 0) return;

    setIsSubmitting(true);
    setStatusMessage(null);

    try {
      const res = await createTransferFromRedistributionAction({
        fromStoreId: activeTransferModal.sourceStoreId,
        toStoreId: selectedDestStoreId,
        items: [
          {
            batchId: activeTransferModal.batchId,
            medicineId: activeTransferModal.medicineId,
            batchNo: activeTransferModal.batchNo,
            expiryDate: activeTransferModal.expiryDate,
            qty: transferQty,
            unitCost: activeTransferModal.purchaseRatePaise,
            mrp: activeTransferModal.mrpPaise,
          },
        ],
        notes: transferNotes,
      });

      if (res.success) {
        setStatusMessage({
          type: "success",
          text: `Draft Transfer ${res.transferNo} generated successfully! Stock ready for dispatch.`,
        });

        // Update local report by removing or decreasing quantity for transferred batch
        setReport((prev) => ({
          ...prev,
          suggestions: prev.suggestions.map((s) => {
            if (s.id === activeTransferModal.id) {
              const remainingSurplus = Math.max(0, s.surplusAtRisk - transferQty);
              return {
                ...s,
                surplusAtRisk: remainingSurplus,
                suggestedTransferQty: Math.max(0, s.suggestedTransferQty - transferQty),
              };
            }
            return s;
          }).filter((s) => s.surplusAtRisk > 0),
        }));

        setActiveTransferModal(null);
      } else {
        setStatusMessage({
          type: "error",
          text: res.error || "Failed to create transfer draft.",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error creating transfer";
      setStatusMessage({ type: "error", text: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          role="alert"
          aria-live="polite"
          className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
            statusMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200"
              : "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 text-sm font-medium">{statusMessage.text}</div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-xs opacity-60 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">At-Risk Capital</span>
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatINR(report.totalAtRiskCapitalPaise)}
          </div>
          <div className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
            Projected expiry surplus across slow branches
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Recoverable Value</span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatINR(report.totalRecoverableValuePaise)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Loss prevented via redistribution transfers
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Batches At Risk</span>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <Layers className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatNumber(report.totalBatchesAtRisk)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Window: 30 to 120 days to expiry
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Critical Batches</span>
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
            {formatNumber(report.criticalUrgencyCount)}
          </div>
          <div className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
            Expiring within 45 days
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-1 items-center gap-2 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-950/50 focus-within:border-teal-500">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search medicine, salt composition, batch #, or branch..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Source Store Filter */}
          <div className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-950/50 text-xs">
            <Store className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
              aria-label="Filter by source branch"
              className="bg-transparent font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="all">All Source Branches</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          {/* Urgency Filter */}
          <div className="flex items-center gap-1 border border-slate-200 dark:border-slate-800 rounded-xl p-1 bg-slate-50 dark:bg-slate-950/50 text-xs">
            {(["all", "critical", "high", "medium"] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setUrgencyFilter(lvl)}
                className={`px-2.5 py-1 rounded-lg capitalize font-medium transition-all ${
                  urgencyFilter === lvl
                    ? "bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-400 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Recommendations List / Table */}
      {filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">
            No Expiry Surplus Found
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            All active batches expiring between 30 and 120 days are projected to dispense naturally
            at their current branches based on 30-day velocity.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
            Redistribution Suggestions ({filteredItems.length})
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredItems.map((item) => {
              const bestDest = item.bestDestinationStore;
              const hasOpportunity = item.suggestedTransferQty > 0 && bestDest != null;

              return (
                <div
                  key={item.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs hover:border-teal-300 dark:hover:border-teal-700 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                >
                  {/* Medicine and Batch Details */}
                  <div className="space-y-2 lg:max-w-md">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 dark:text-white text-base">
                        {item.medicineName}
                      </span>
                      {item.genericName && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          ({item.genericName})
                        </span>
                      )}
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          item.urgency === "critical"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300"
                            : item.urgency === "high"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300"
                        }`}
                      >
                        {item.daysToExpiry}d to expiry ({item.urgency})
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-3">
                      <span>Batch: <strong className="text-slate-800 dark:text-slate-200">{item.batchNo}</strong></span>
                      <span>Expires: <strong>{item.expiryDate}</strong></span>
                      <span>Cost: <strong>{formatINR(item.purchaseRatePaise)}</strong></span>
                      <span>MRP: <strong>{formatINR(item.mrpPaise)}</strong></span>
                    </div>

                    {/* Source Store Metric */}
                    <div className="text-xs bg-slate-50 dark:bg-slate-950/60 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60 flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <Store className="w-3.5 h-3.5 text-slate-400" />
                        <span>Source: <strong>{item.sourceStoreName}</strong></span>
                      </div>
                      <div className="text-slate-500">
                        On Hand: <strong>{formatNumber(item.sourceOnHand)}</strong>
                      </div>
                      <div className="text-slate-500">
                        Velocity: <strong>{item.sourceDailyVelocity}/day</strong>
                      </div>
                      <div className="text-rose-600 dark:text-rose-400 font-medium">
                        Surplus at Risk: <strong>{formatNumber(item.surplusAtRisk)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Redistribution Opportunity Matching */}
                  <div className="flex-1 lg:max-w-md">
                    {hasOpportunity ? (
                      <div className="bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-800/60 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-teal-900 dark:text-teal-200">
                          <span className="flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            Best Target: {bestDest.storeName} ({bestDest.storeCode})
                          </span>
                          <span className="text-emerald-700 dark:text-emerald-300">
                            Prevents {formatINR(item.potentialLossPreventedPaise)} loss
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-white/80 dark:bg-slate-900/80 p-1.5 rounded-lg border border-teal-100 dark:border-teal-900/50">
                            <div className="text-slate-500 text-[10px] uppercase">Dest Velocity</div>
                            <div className="font-bold text-slate-800 dark:text-slate-200">
                              {bestDest.dailyVelocity}/day
                            </div>
                          </div>
                          <div className="bg-white/80 dark:bg-slate-900/80 p-1.5 rounded-lg border border-teal-100 dark:border-teal-900/50">
                            <div className="text-slate-500 text-[10px] uppercase">Net Deficit</div>
                            <div className="font-bold text-teal-700 dark:text-teal-300">
                              {formatNumber(bestDest.netCapacity)}
                            </div>
                          </div>
                          <div className="bg-white/80 dark:bg-slate-900/80 p-1.5 rounded-lg border border-teal-100 dark:border-teal-900/50">
                            <div className="text-slate-500 text-[10px] uppercase">Suggested Trf</div>
                            <div className="font-bold text-emerald-600 dark:text-emerald-400">
                              {formatNumber(item.suggestedTransferQty)} units
                            </div>
                          </div>
                        </div>

                        {item.allCandidateDestinations.length > 1 && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            + {item.allCandidateDestinations.length - 1} other branch with capacity
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-500">
                        <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">
                          No High-Velocity Destination
                        </div>
                        Other branches do not have sufficient sales velocity to absorb this surplus before expiry.
                        Consider vendor expiry return claim (Task B3.6).
                      </div>
                    )}
                  </div>

                  {/* Action Button */}
                  <div className="shrink-0 flex items-center justify-end">
                    {hasOpportunity ? (
                      <button
                        onClick={() => handleOpenTransfer(item)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-medium text-xs shadow-xs transition-all cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Initiate Transfer ({formatNumber(item.suggestedTransferQty)})
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 italic">No transfer target</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transfer Confirmation Modal */}
      {activeTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400 font-semibold text-base">
                <Send className="w-5 h-5" />
                Initiate Expiry Redistribution Transfer
              </div>
              <button
                onClick={() => setActiveTransferModal(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 dark:bg-slate-950/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="font-bold text-slate-900 dark:text-white text-sm">
                  {activeTransferModal.medicineName}
                </div>
                <div className="text-slate-500 flex justify-between">
                  <span>Batch: {activeTransferModal.batchNo}</span>
                  <span>Expires: {activeTransferModal.expiryDate} ({activeTransferModal.daysToExpiry}d left)</span>
                </div>
                <div className="text-slate-500 flex justify-between">
                  <span>Purchase Rate: {formatINR(activeTransferModal.purchaseRatePaise)}</span>
                  <span>Source On-Hand: {activeTransferModal.sourceOnHand}</span>
                </div>
              </div>

              {/* Source & Destination */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-400 font-medium uppercase text-[10px]">Source Branch</div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {activeTransferModal.sourceStoreName}
                  </div>
                </div>

                <div className="p-3 bg-teal-50/50 dark:bg-teal-950/30 rounded-xl border border-teal-200/60 dark:border-teal-800/60">
                  <div className="text-teal-700 dark:text-teal-400 font-medium uppercase text-[10px]">
                    Destination Branch
                  </div>
                  <select
                    value={selectedDestStoreId}
                    onChange={(e) => setSelectedDestStoreId(e.target.value)}
                    aria-label="Select destination branch"
                    className="w-full mt-0.5 bg-transparent font-semibold text-teal-900 dark:text-teal-200 focus:outline-none"
                  >
                    {activeTransferModal.allCandidateDestinations.map((cand) => (
                      <option key={cand.storeId} value={cand.storeId}>
                        {cand.storeName} (Cap: {cand.netCapacity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quantity to transfer */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Transfer Quantity (Base Units)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={activeTransferModal.sourceOnHand}
                    value={transferQty}
                    onChange={(e) => setTransferQty(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 font-semibold focus:outline-none focus:border-teal-500"
                  />
                  <span className="text-slate-500 whitespace-nowrap">
                    {activeTransferModal.looseUnit}s (
                    {Math.ceil(transferQty / activeTransferModal.unitsPerPack)}{" "}
                    {activeTransferModal.packUnit}s)
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500 flex justify-between">
                  <span>Suggested: {activeTransferModal.suggestedTransferQty} units</span>
                  <span>
                    Value: {formatINR(transferQty * activeTransferModal.purchaseRatePaise)}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Transfer Memo / Notes
                </label>
                <textarea
                  rows={2}
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTransferModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTransfer}
                disabled={isSubmitting || transferQty <= 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 transition-all cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating Transfer...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirm & Create Draft Transfer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

