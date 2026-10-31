"use client";

import React, { useState, useTransition } from "react";
import { formatINR, formatNumber } from "@/lib/format";
import {
  quarantineBatchAction,
  createSupplierExpiryClaimAction,
  settleSupplierExpiryClaimAction,
} from "@/app/actions/quarantine";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  Filter,
  IndianRupee,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";

interface QuarantinedItem {
  id: string;
  storeId: string;
  batchId: string;
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  packUnit: string;
  looseUnit: string;
  batchNo: string;
  expiryDate: string;
  supplierId: string | null;
  supplierName: string;
  qty: number;
  ratePaise: number;
  mrpPaise: number;
  totalPaise: number;
  reason: string;
  status: string;
  claimId: string | null;
  quarantinedAt: Date | string;
  notes: string | null;
}

interface NearExpiryBatch {
  id: string;
  batchNo: string;
  expiryDate: string;
  qtyOnHand: number;
  purchaseRatePaise: number;
  mrpPaise: number;
  supplierId: string | null;
  supplierName: string | null;
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  packUnit: string | null;
  looseUnit: string | null;
  isExpired: boolean;
}

interface ExpiryClaimItem {
  id: string;
  claimNo: string;
  supplierId: string;
  supplierName: string;
  status: string;
  totalPaise: number;
  settlementType: string | null;
  supplierCreditNoteNo: string | null;
  notes: string | null;
  createdAt: Date | string;
  settledAt: Date | string | null;
}

interface Props {
  initialQuarantined: QuarantinedItem[];
  initialNearExpiry: NearExpiryBatch[];
  initialClaims: ExpiryClaimItem[];
}

export function QuarantineClient({
  initialQuarantined,
  initialNearExpiry,
  initialClaims,
}: Props) {
  const [activeTab, setActiveTab] = useState<"quarantined" | "claims" | "near_expiry">("quarantined");
  const [quarantined, setQuarantined] = useState<QuarantinedItem[]>(initialQuarantined);
  const [nearExpiry, setNearExpiry] = useState<NearExpiryBatch[]>(initialNearExpiry);
  const [claims, setClaims] = useState<ExpiryClaimItem[]>(initialClaims);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState("all");
  const [selectedQuarantineIds, setSelectedQuarantineIds] = useState<string[]>([]);

  // Modals state
  const [quarantineModalBatch, setQuarantineModalBatch] = useState<NearExpiryBatch | null>(null);
  const [quarantineQty, setQuarantineQty] = useState(0);
  const [quarantineReason, setQuarantineReason] = useState<"expired" | "damaged" | "recalled">("expired");
  const [quarantineNotes, setQuarantineNotes] = useState("");

  const [settleModalClaim, setSettleModalClaim] = useState<ExpiryClaimItem | null>(null);
  const [settlementType, setSettlementType] = useState<"credit_note" | "replacement_stock" | "written_off">("credit_note");
  const [creditNoteNo, setCreditNoteNo] = useState("");
  const [settleNotes, setSettleNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Group suppliers for dropdown filter
  const suppliersList = Array.from(
    new Set(
      [
        ...quarantined.map((q) => q.supplierName),
        ...nearExpiry.map((n) => n.supplierName || "Unassigned Distributor"),
      ].filter(Boolean)
    )
  );

  // Filtered Quarantined Stock
  const filteredQuarantined = quarantined.filter((item) => {
    if (item.status !== "quarantined") return false; // only show unclaimed in table
    if (selectedSupplierFilter !== "all" && item.supplierName !== selectedSupplierFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.medicineName.toLowerCase().includes(q) ||
        item.batchNo.toLowerCase().includes(q) ||
        item.supplierName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Calculate totals for KPI header
  const totalQuarantinedValPaise = quarantined
    .filter((q) => q.status === "quarantined")
    .reduce((sum, q) => sum + q.totalPaise, 0);

  const totalClaimedPendingPaise = claims
    .filter((c) => c.status === "submitted")
    .reduce((sum, c) => sum + c.totalPaise, 0);

  const totalSettledPaise = claims
    .filter((c) => c.status === "settled")
    .reduce((sum, c) => sum + c.totalPaise, 0);

  // Quarantine Batch Handlers
  const handleOpenQuarantine = (batch: NearExpiryBatch) => {
    setQuarantineModalBatch(batch);
    setQuarantineQty(batch.qtyOnHand);
    setQuarantineReason(batch.isExpired ? "expired" : "damaged");
    setQuarantineNotes("");
    setNotification(null);
  };

  const handleConfirmQuarantine = async () => {
    if (!quarantineModalBatch || quarantineQty <= 0) return;
    setIsSubmitting(true);
    setNotification(null);

    try {
      const res = await quarantineBatchAction({
        batchId: quarantineModalBatch.id,
        qty: quarantineQty,
        reason: quarantineReason,
        notes: quarantineNotes,
      });

      if (res.success) {
        setNotification({
          type: "success",
          text: `Successfully quarantined ${quarantineQty} units of ${quarantineModalBatch.medicineName} (${quarantineModalBatch.batchNo}). Stock isolated from POS.`,
        });

        // Update local state
        setNearExpiry((prev) =>
          prev
            .map((b) =>
              b.id === quarantineModalBatch.id
                ? { ...b, qtyOnHand: b.qtyOnHand - quarantineQty }
                : b
            )
            .filter((b) => b.qtyOnHand > 0)
        );

        setQuarantined((prev) => [
          {
            id: res.quarantineId || `q-${Date.now()}`,
            storeId: "",
            batchId: quarantineModalBatch.id,
            medicineId: quarantineModalBatch.medicineId,
            medicineName: quarantineModalBatch.medicineName,
            genericName: quarantineModalBatch.genericName,
            packUnit: quarantineModalBatch.packUnit || "pack",
            looseUnit: quarantineModalBatch.looseUnit || "unit",
            batchNo: quarantineModalBatch.batchNo,
            expiryDate: quarantineModalBatch.expiryDate,
            supplierId: quarantineModalBatch.supplierId,
            supplierName: quarantineModalBatch.supplierName || "Unassigned Distributor",
            qty: quarantineQty,
            ratePaise: quarantineModalBatch.purchaseRatePaise,
            mrpPaise: quarantineModalBatch.mrpPaise,
            totalPaise: quarantineModalBatch.purchaseRatePaise * quarantineQty,
            reason: quarantineReason,
            status: "quarantined",
            claimId: null,
            quarantinedAt: new Date().toISOString(),
            notes: quarantineNotes,
          },
          ...prev,
        ]);

        setQuarantineModalBatch(null);
        setActiveTab("quarantined");
      } else {
        setNotification({ type: "error", text: res.error || "Failed to quarantine batch" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error during quarantine";
      setNotification({ type: "error", text: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate Claim Handler
  const handleGenerateSupplierClaim = async () => {
    if (selectedQuarantineIds.length === 0) return;

    // Verify all selected belong to the same supplier
    const selectedItems = quarantined.filter((q) => selectedQuarantineIds.includes(q.id));
    const supplierId = selectedItems[0]?.supplierId;
    if (!supplierId) {
      setNotification({
        type: "error",
        text: "Selected items must have an assigned supplier to generate a debit note.",
      });
      return;
    }

    const hasMismatch = selectedItems.some((q) => q.supplierId !== supplierId);
    if (hasMismatch) {
      setNotification({
        type: "error",
        text: "All selected items for a claim must belong to the same distributor/supplier.",
      });
      return;
    }

    setIsSubmitting(true);
    setNotification(null);

    try {
      const res = await createSupplierExpiryClaimAction({
        supplierId,
        quarantineIds: selectedQuarantineIds,
        notes: `Distributor claim for ${selectedItems.length} quarantined batches`,
      });

      if (res.success && res.claimId && res.claimNo) {
        setNotification({
          type: "success",
          text: `Debit Claim ${res.claimNo} generated for ${formatINR(res.totalPaise || 0)}! Supplier account debited.`,
        });

        // Update local state
        setQuarantined((prev) =>
          prev.map((q) =>
            selectedQuarantineIds.includes(q.id)
              ? { ...q, status: "claimed", claimId: res.claimId }
              : q
          )
        );

        setClaims((prev) => [
          {
            id: res.claimId,
            claimNo: res.claimNo,
            supplierId,
            supplierName: selectedItems[0].supplierName,
            status: "submitted",
            totalPaise: res.totalPaise || 0,
            settlementType: null,
            supplierCreditNoteNo: null,
            notes: "Distributor claim for quarantined stock",
            createdAt: new Date().toISOString(),
            settledAt: null,
          },
          ...prev,
        ]);

        setSelectedQuarantineIds([]);
        setActiveTab("claims");
      } else {
        setNotification({ type: "error", text: res.error || "Failed to generate claim" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error generating claim";
      setNotification({ type: "error", text: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Settle Claim Handler
  const handleConfirmSettle = async () => {
    if (!settleModalClaim) return;
    setIsSubmitting(true);
    setNotification(null);

    try {
      const res = await settleSupplierExpiryClaimAction({
        claimId: settleModalClaim.id,
        settlementType,
        supplierCreditNoteNo: creditNoteNo,
        notes: settleNotes,
      });

      if (res.success) {
        setNotification({
          type: "success",
          text: `Claim ${settleModalClaim.claimNo} settled via ${settlementType.replace("_", " ")}!`,
        });

        setClaims((prev) =>
          prev.map((c) =>
            c.id === settleModalClaim.id
              ? {
                  ...c,
                  status: res.status || "settled",
                  settlementType,
                  supplierCreditNoteNo: creditNoteNo || null,
                  settledAt: new Date().toISOString(),
                }
              : c
          )
        );

        setSettleModalClaim(null);
      } else {
        setNotification({ type: "error", text: res.error || "Failed to settle claim" });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error settling claim";
      setNotification({ type: "error", text: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {notification && (
        <div
          role="alert"
          aria-live="polite"
          className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
            notification.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200"
              : "bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 text-sm font-medium">{notification.text}</div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Quarantined Stock Value</span>
            <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatINR(totalQuarantinedValPaise)}
          </div>
          <div className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
            {filteredQuarantined.length} unclaimed batches isolated from POS
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Claims Pending Settlement</span>
            <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {formatINR(totalClaimedPendingPaise)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Debited to distributors; awaiting credit note/stock
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Settled & Recovered Value</span>
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatINR(totalSettledPaise)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Resolved via credit notes or replacement batches
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab("quarantined")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "quarantined"
              ? "bg-teal-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Quarantined Dump Stock ({filteredQuarantined.length})
        </button>

        <button
          onClick={() => setActiveTab("claims")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "claims"
              ? "bg-teal-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <FileText className="w-4 h-4" />
          Distributor Debit Claims ({claims.length})
        </button>

        <button
          onClick={() => setActiveTab("near_expiry")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === "near_expiry"
              ? "bg-teal-600 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <AlertOctagon className="w-4 h-4" />
          Near-Expiry / Expired Inventory ({nearExpiry.length})
        </button>
      </div>

      {/* Tab 1: Quarantined Dump Stock */}
      {activeTab === "quarantined" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex items-center gap-2 flex-1 max-w-md border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-950">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search quarantined medicine, batch #, supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedSupplierFilter}
                onChange={(e) => setSelectedSupplierFilter(e.target.value)}
                aria-label="Filter quarantined stock by supplier"
                className="border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-950 text-xs font-medium focus:outline-none"
              >
                <option value="all">All Distributors</option>
                {suppliersList.map((sup) => (
                  <option key={sup} value={sup}>
                    {sup}
                  </option>
                ))}
              </select>

              {selectedQuarantineIds.length > 0 && (
                <button
                  onClick={handleGenerateSupplierClaim}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileCheck2 className="w-3.5 h-3.5" />
                  )}
                  Create Debit Note ({selectedQuarantineIds.length})
                </button>
              )}
            </div>
          </div>

          {filteredQuarantined.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                No Quarantined Stock Awaiting Claims
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                No dump stock currently in quarantine. Check the Near-Expiry tab to isolate expired batches from active inventory.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3 w-8">
                      <input
                        type="checkbox"
                        checked={
                          selectedQuarantineIds.length === filteredQuarantined.length &&
                          filteredQuarantined.length > 0
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedQuarantineIds(filteredQuarantined.map((q) => q.id));
                          } else {
                            setSelectedQuarantineIds([]);
                          }
                        }}
                        aria-label="Select all quarantined items"
                        className="rounded"
                      />
                    </th>
                    <th className="p-3">Medicine & Batch</th>
                    <th className="p-3">Distributor / Supplier</th>
                    <th className="p-3">Reason</th>
                    <th className="p-3 text-right">Quarantined Qty</th>
                    <th className="p-3 text-right">Cost Rate</th>
                    <th className="p-3 text-right">Total Debit Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredQuarantined.map((item) => {
                    const isSelected = selectedQuarantineIds.includes(item.id);
                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                          isSelected ? "bg-teal-50/50 dark:bg-teal-950/30" : ""
                        }`}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedQuarantineIds((prev) => [...prev, item.id]);
                              } else {
                                setSelectedQuarantineIds((prev) => prev.filter((id) => id !== item.id));
                              }
                            }}
                            aria-label={`Select ${item.medicineName} batch ${item.batchNo}`}
                            className="rounded"
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {item.medicineName}
                          </div>
                          <div className="text-[11px] text-slate-500 flex gap-2">
                            <span>Batch: <strong>{item.batchNo}</strong></span>
                            <span>Exp: <strong>{item.expiryDate}</strong></span>
                          </div>
                        </td>
                        <td className="p-3 font-medium text-slate-700 dark:text-slate-300">
                          {item.supplierName}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                              item.reason === "expired"
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                : item.reason === "damaged"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                : "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300"
                            }`}
                          >
                            {item.reason}
                          </span>
                        </td>
                        <td className="p-3 text-right font-semibold text-slate-800 dark:text-slate-200">
                          {formatNumber(item.qty)} {item.looseUnit}s
                        </td>
                        <td className="p-3 text-right text-slate-600 dark:text-slate-400">
                          {formatINR(item.ratePaise)}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                          {formatINR(item.totalPaise)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Distributor Debit Claims */}
      {activeTab === "claims" && (
        <div className="space-y-4">
          {claims.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center">
              <FileText className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                No Distributor Claims Found
              </h4>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Generate formal debit note claims (DN/EXP/...) from the Quarantined Dump Stock tab.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3">Claim #</th>
                    <th className="p-3">Distributor</th>
                    <th className="p-3">Claim Date</th>
                    <th className="p-3 text-right">Debit Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Settlement Info</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {claims.map((claim) => (
                    <tr key={claim.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-bold text-teal-700 dark:text-teal-400">
                        {claim.claimNo}
                      </td>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                        {claim.supplierName}
                      </td>
                      <td className="p-3 text-slate-500">
                        {typeof claim.createdAt === "string" ? claim.createdAt.slice(0, 10) : new Date(claim.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900 dark:text-white">
                        {formatINR(claim.totalPaise)}
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            claim.status === "settled"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : claim.status === "submitted"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                          }`}
                        >
                          {claim.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">
                        {claim.settlementType ? (
                          <span>
                            {claim.settlementType.replace("_", " ")}
                            {claim.supplierCreditNoteNo ? ` (${claim.supplierCreditNoteNo})` : ""}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Pending distributor resolution</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        {claim.status === "submitted" && (
                          <button
                            onClick={() => {
                              setSettleModalClaim(claim);
                              setSettlementType("credit_note");
                              setCreditNoteNo("");
                              setSettleNotes("");
                            }}
                            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-all cursor-pointer"
                          >
                            Settle Claim
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Near-Expiry / Expired Active Stock */}
      {activeTab === "near_expiry" && (
        <div className="space-y-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Batches expiring within 90 days or already expired sitting in active inventory.
            Click <strong>Quarantine</strong> to immediately isolate a batch so it cannot be billed in POS.
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Medicine & Salt</th>
                  <th className="p-3">Batch #</th>
                  <th className="p-3">Expiry Date</th>
                  <th className="p-3">Distributor</th>
                  <th className="p-3 text-right">On Hand Qty</th>
                  <th className="p-3 text-right">Cost Value</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {nearExpiry.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="p-3">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {b.medicineName}
                      </div>
                      {b.genericName && (
                        <div className="text-[11px] text-slate-400">{b.genericName}</div>
                      )}
                    </td>
                    <td className="p-3 font-medium text-slate-800 dark:text-slate-200">
                      {b.batchNo}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          b.isExpired
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                        }`}
                      >
                        {b.expiryDate} {b.isExpired ? "(EXPIRED)" : ""}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400">
                      {b.supplierName || "Direct / Unassigned"}
                    </td>
                    <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-200">
                      {formatNumber(b.qtyOnHand)} {b.looseUnit || "units"}
                    </td>
                    <td className="p-3 text-right text-slate-600 dark:text-slate-400">
                      {formatINR(b.purchaseRatePaise * b.qtyOnHand)}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleOpenQuarantine(b)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs transition-all cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Quarantine
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quarantine Modal */}
      {quarantineModalBatch && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold text-base">
                <ShieldAlert className="w-5 h-5" />
                Isolate Stock to Quarantine
              </div>
              <button
                onClick={() => setQuarantineModalBatch(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  {quarantineModalBatch.medicineName}
                </div>
                <div className="text-slate-500 flex justify-between">
                  <span>Batch: {quarantineModalBatch.batchNo}</span>
                  <span>Expires: {quarantineModalBatch.expiryDate}</span>
                </div>
                <div className="text-slate-500 flex justify-between">
                  <span>Distributor: {quarantineModalBatch.supplierName || "Unassigned"}</span>
                  <span>Available: {quarantineModalBatch.qtyOnHand}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Quantity to Quarantine
                </label>
                <input
                  type="number"
                  min={1}
                  max={quarantineModalBatch.qtyOnHand}
                  value={quarantineQty}
                  onChange={(e) => setQuarantineQty(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 font-semibold focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Reason for Quarantine
                </label>
                <select
                  value={quarantineReason}
                  onChange={(e) => setQuarantineReason(e.target.value as "expired" | "damaged" | "recalled")}
                  aria-label="Reason for quarantining stock"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 font-medium focus:outline-none focus:border-rose-500"
                >
                  <option value="expired">Expired Date Surpassed</option>
                  <option value="damaged">Damaged / Broken Packaging</option>
                  <option value="recalled">Manufacturer / Regulatory Recall</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Notes / Dump Memo
                </label>
                <textarea
                  rows={2}
                  value={quarantineNotes}
                  onChange={(e) => setQuarantineNotes(e.target.value)}
                  placeholder="Optional audit notes regarding packaging or supplier communication..."
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setQuarantineModalBatch(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmQuarantine}
                disabled={isSubmitting || quarantineQty <= 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5" />
                )}
                Confirm Quarantine
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settle Claim Modal */}
      {settleModalClaim && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400 font-semibold text-base">
                <FileCheck2 className="w-5 h-5" />
                Settle Distributor Debit Claim
              </div>
              <button
                onClick={() => setSettleModalClaim(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  Claim #{settleModalClaim.claimNo}
                </div>
                <div className="text-slate-500 flex justify-between">
                  <span>Distributor: {settleModalClaim.supplierName}</span>
                  <span>Amount: {formatINR(settleModalClaim.totalPaise)}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Settlement Resolution Type
                </label>
                <select
                  value={settlementType}
                  onChange={(e) => setSettlementType(e.target.value as "credit_note" | "replacement_stock" | "written_off")}
                  aria-label="Settlement resolution type"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 font-medium focus:outline-none focus:border-teal-500"
                >
                  <option value="credit_note">Distributor Credit Note (Balance deduction)</option>
                  <option value="replacement_stock">Physical Replacement Goods Received</option>
                  <option value="written_off">Claim Rejected / Write-Off Loss</option>
                </select>
              </div>

              {settlementType === "credit_note" && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    Distributor Credit Note Number
                  </label>
                  <input
                    type="text"
                    value={creditNoteNo}
                    onChange={(e) => setCreditNoteNo(e.target.value)}
                    placeholder="e.g. CN/2026/884"
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 font-medium focus:outline-none focus:border-teal-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Settlement Remarks / Voucher Notes
                </label>
                <textarea
                  rows={2}
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="Record supplier ledger reconciliation details..."
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSettleModalClaim(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSettle}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Confirm Settlement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

