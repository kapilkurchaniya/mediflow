"use client";

import React, { useState, useTransition } from "react";
import { formatINR, formatNumber } from "@/lib/format";
import {
  recordStockAuditCountsAction,
  approveStockAuditSessionAction,
  cancelStockAuditSessionAction,
} from "@/app/actions/stocktake";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  EyeOff,
  FileCheck2,
  HelpCircle,
  Layers,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  Undo2,
  XCircle,
} from "lucide-react";

interface AuditItem {
  id: string;
  batchId: string;
  medicineId: string;
  medicineName: string;
  genericName: string | null;
  packUnit: string;
  looseUnit: string;
  batchNo: string;
  expiryDate: string;
  rackCode: string;
  rackName: string;
  systemQty: number | null;
  countedQty: number | null;
  varianceQty: number | null;
  unitCostPaise: number;
  varianceCostPaise: number;
  status: string;
}

interface AuditSession {
  id: string;
  sessionNo: string;
  storeId: string;
  storeName: string;
  storeCode: string;
  scope: string;
  rackIds: string[] | null;
  blindCount: boolean;
  status: string;
  notes: string | null;
  startedBy: string;
  approvedBy: string | null;
  approvedAt: Date | string | null;
  createdAt: Date | string;
}

interface AuditSummary {
  totalLines: number;
  countedLines: number;
  pendingLines: number;
  shortageLines: number;
  excessLines: number;
  exactLines: number;
  totalShortageCostPaise: number;
  totalExcessCostPaise: number;
  netVarianceCostPaise: number;
}

interface Props {
  initialSession: AuditSession;
  initialItems: AuditItem[];
  initialSummary: AuditSummary;
}

export function StocktakeSessionClient({
  initialSession,
  initialItems,
  initialSummary,
}: Props) {
  const [session, setSession] = useState<AuditSession>(initialSession);
  const [items, setItems] = useState<AuditItem[]>(initialItems);
  const [summary, setSummary] = useState<AuditSummary>(initialSummary);

  const [countInputs, setCountInputs] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of initialItems) {
      if (item.countedQty !== null) {
        init[item.id] = String(item.countedQty);
      }
    }
    return init;
  });

  const [filterMode, setFilterMode] = useState<"all" | "discrepancies" | "pending">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const isClosed = session.status === "approved" || session.status === "cancelled";

  const handleCountChange = (itemId: string, val: string) => {
    setCountInputs((prev) => ({ ...prev, [itemId]: val }));
  };

  const handleSaveCounts = async () => {
    const countsToSave = Object.entries(countInputs)
      .filter(([_, v]) => v.trim() !== "")
      .map(([id, val]) => ({
        itemId: id,
        countedQty: Math.max(0, parseInt(val, 10) || 0),
      }));

    if (countsToSave.length === 0) return;

    setIsSaving(true);
    setNotification(null);

    try {
      const res = await recordStockAuditCountsAction({
        sessionId: session.id,
        counts: countsToSave,
      });

      if (res.success) {
        setNotification({
          type: "success",
          text: `Saved ${countsToSave.length} counted items. Session is now Under Review.`,
        });

        // Update local items
        setItems((prev) =>
          prev.map((item) => {
            const countEntry = countsToSave.find((c) => c.itemId === item.id);
            if (countEntry) {
              const variance =
                item.systemQty !== null ? countEntry.countedQty - item.systemQty : null;
              const varianceCost =
                variance !== null ? variance * item.unitCostPaise : 0;
              return {
                ...item,
                countedQty: countEntry.countedQty,
                varianceQty: variance,
                varianceCostPaise: varianceCost,
                status: "counted",
              };
            }
            return item;
          })
        );

        setSession((prev) => ({ ...prev, status: "under_review" }));
      } else {
        setNotification({ type: "error", text: res.error || "Failed to save counts" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error saving counts";
      setNotification({ type: "error", text: msg });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveReconciliation = async () => {
    setIsApproving(true);
    setNotification(null);

    try {
      const res = await approveStockAuditSessionAction({
        sessionId: session.id,
        notes: approvalNotes,
      });

      if (res.success && "reconciledAdjustmentsCount" in res) {
        setNotification({
          type: "success",
          text: `Audit ${session.sessionNo} approved! ${res.reconciledAdjustmentsCount} inventory adjustments and balancing journal vouchers posted.`,
        });

        setSession((prev) => ({
          ...prev,
          status: "approved",
          approvedAt: new Date().toISOString(),
        }));
        setShowApprovalModal(false);
      } else {
        setNotification({ type: "error", text: res.error || "Failed to approve audit" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error approving audit";
      setNotification({ type: "error", text: msg });
    } finally {
      setIsApproving(false);
    }
  };

  const handleCancelSession = async () => {
    if (!confirm("Are you sure you want to cancel this audit session? Unsaved counts will be discarded.")) return;

    try {
      const res = await cancelStockAuditSessionAction({ sessionId: session.id });
      if (res.success) {
        setSession((prev) => ({ ...prev, status: "cancelled" }));
        setNotification({ type: "success", text: "Audit session cancelled." });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error cancelling audit";
      setNotification({ type: "error", text: msg });
    }
  };

  const filteredItems = items.filter((item) => {
    if (filterMode === "pending" && item.countedQty !== null) return false;
    if (filterMode === "discrepancies" && (item.varianceQty === 0 || item.varianceQty === null)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.medicineName.toLowerCase().includes(q) ||
        item.batchNo.toLowerCase().includes(q) ||
        item.rackCode.toLowerCase().includes(q)
      );
    }
    return true;
  });

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

      {/* Session Metadata Banner */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {session.sessionNo}
            </h2>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                session.status === "approved"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                  : session.status === "under_review"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                  : session.status === "in_progress"
                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {session.status.replace("_", " ")}
            </span>
            {session.blindCount && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-0.5 rounded-full">
                <EyeOff className="w-3 h-3" /> Blind Count
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-4">
            <span>Branch: <strong>{session.storeName}</strong></span>
            <span>Scope: <strong className="capitalize">{session.scope.replace("_", " ")}</strong></span>
            <span>Created: <strong>{typeof session.createdAt === "string" ? session.createdAt.slice(0, 10) : new Date(session.createdAt).toLocaleDateString()}</strong></span>
            {session.approvedAt && (
              <span>Approved: <strong>{typeof session.approvedAt === "string" ? session.approvedAt.slice(0, 10) : new Date(session.approvedAt).toLocaleDateString()}</strong></span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          {!isClosed && (
            <>
              <button
                type="button"
                onClick={handleSaveCounts}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-medium text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Counts
              </button>

              <button
                type="button"
                onClick={() => setShowApprovalModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve & Reconcile
              </button>

              <button
                type="button"
                onClick={handleCancelSession}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                title="Cancel Session"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Discrepancy KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold uppercase">Count Progress</div>
          <div className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {summary.countedLines} / {summary.totalLines} lines
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {summary.pendingLines} uncounted batches
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-rose-600 dark:text-rose-400 font-semibold uppercase flex items-center gap-1">
            <ArrowDownLeft className="w-3.5 h-3.5" /> Shortages (Shelf Loss)
          </div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 mt-1">
            {formatINR(summary.totalShortageCostPaise)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {summary.shortageLines} lines short
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" /> Excess Stock
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {formatINR(summary.totalExcessCostPaise)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {summary.excessLines} lines found surplus
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="text-xs text-slate-500 font-semibold uppercase">Net Ledger Variance</div>
          <div className={`text-xl font-bold mt-1 ${
            summary.netVarianceCostPaise < 0
              ? "text-rose-600 dark:text-rose-400"
              : summary.netVarianceCostPaise > 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-slate-700 dark:text-slate-300"
          }`}>
            {formatINR(Math.abs(summary.netVarianceCostPaise))}
            <span className="text-xs font-normal ml-1">
              {summary.netVarianceCostPaise < 0 ? "(Short)" : summary.netVarianceCostPaise > 0 ? "(Gain)" : ""}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Valued at purchase rate (cost)
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-1 max-w-md border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-950">
          <input
            type="text"
            placeholder="Search medicine, batch #, or rack code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 rounded-xl p-1 bg-slate-50 dark:bg-slate-950 text-xs">
          {(["all", "discrepancies", "pending"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-3 py-1 rounded-lg capitalize font-medium transition-all ${
                filterMode === mode
                  ? "bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-400 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Items Count Sheet Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="p-3">Rack</th>
              <th className="p-3">Medicine & Batch</th>
              <th className="p-3">Expiry</th>
              <th className="p-3 text-right">System Qty</th>
              <th className="p-3 text-right w-32">Physical Count</th>
              <th className="p-3 text-right">Variance</th>
              <th className="p-3 text-right">Financial Impact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredItems.map((item) => {
              const isShort = (item.varianceQty || 0) < 0;
              const isExcess = (item.varianceQty || 0) > 0;
              const currentInput = countInputs[item.id] ?? (item.countedQty !== null ? String(item.countedQty) : "");

              return (
                <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="p-3">
                    <span className="font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded">
                      {item.rackCode}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {item.medicineName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Batch: <strong className="text-slate-700 dark:text-slate-300">{item.batchNo}</strong>
                    </div>
                  </td>
                  <td className="p-3 text-slate-500">{item.expiryDate}</td>

                  {/* System Qty (Masked in blind mode for counting staff) */}
                  <td className="p-3 text-right font-medium">
                    {item.systemQty === null ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 italic">
                        <Lock className="w-3 h-3" /> Blind
                      </span>
                    ) : (
                      <span>{formatNumber(item.systemQty)} {item.looseUnit}s</span>
                    )}
                  </td>

                  {/* Physical Count Input */}
                  <td className="p-3 text-right">
                    {isClosed ? (
                      <span className="font-bold text-slate-900 dark:text-white">
                        {item.countedQty !== null ? formatNumber(item.countedQty) : "—"}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        placeholder="Count"
                        value={currentInput}
                        onChange={(e) => handleCountChange(item.id, e.target.value)}
                        className="w-24 text-right px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-bold focus:outline-none focus:border-teal-500"
                      />
                    )}
                  </td>

                  {/* Variance Qty */}
                  <td className="p-3 text-right font-bold">
                    {item.varianceQty === null ? (
                      <span className="text-slate-400 font-normal italic">Pending</span>
                    ) : item.varianceQty === 0 ? (
                      <span className="text-slate-400 font-normal">Exact (0)</span>
                    ) : isShort ? (
                      <span className="text-rose-600 dark:text-rose-400">
                        {item.varianceQty} {item.looseUnit}s
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{item.varianceQty} {item.looseUnit}s
                      </span>
                    )}
                  </td>

                  {/* Financial Impact */}
                  <td className="p-3 text-right font-bold">
                    {item.varianceQty === null || item.varianceQty === 0 ? (
                      <span className="text-slate-400 font-normal">₹0.00</span>
                    ) : isShort ? (
                      <span className="text-rose-600 dark:text-rose-400">
                        -{formatINR(Math.abs(item.varianceCostPaise))}
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        +{formatINR(item.varianceCostPaise)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Approval Confirmation Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-teal-700 dark:text-teal-400 font-semibold text-base">
                <FileCheck2 className="w-5 h-5" />
                Approve & Reconcile Physical Stocktake
              </div>
              <button
                onClick={() => setShowApprovalModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300">
                Approving this session will adjust the live inventory on hand to match the physical counts,
                write immutable audit trail stock movements, and post balanced GL vouchers.
              </p>

              <div className="bg-slate-50 dark:bg-slate-950 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Shortage Discrepancies:</span>
                  <strong className="text-rose-600">
                    -{formatINR(summary.totalShortageCostPaise)} ({summary.shortageLines} items)
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Excess Discrepancies:</span>
                  <strong className="text-emerald-600">
                    +{formatINR(summary.totalExcessCostPaise)} ({summary.excessLines} items)
                  </strong>
                </div>
                <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800 flex justify-between font-bold">
                  <span>Net Ledger Impact:</span>
                  <span className={summary.netVarianceCostPaise < 0 ? "text-rose-600" : "text-emerald-600"}>
                    {formatINR(Math.abs(summary.netVarianceCostPaise))} {summary.netVarianceCostPaise < 0 ? "(Expense / Loss)" : "(Gain)"}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                  Reconciliation Sign-Off Notes
                </label>
                <textarea
                  rows={2}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Record verification notes or reason for discrepancies..."
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApproveReconciliation}
                disabled={isApproving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
              >
                {isApproving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                Confirm Sign-Off & Reconcile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
