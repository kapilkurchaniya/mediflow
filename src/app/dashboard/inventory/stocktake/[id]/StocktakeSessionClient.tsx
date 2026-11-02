"use client";

import React, { useState } from "react";
import {
  recordStockAuditCountsAction,
  approveStockAuditSessionAction,
  cancelStockAuditSessionAction,
} from "@/app/actions/stocktake";
import {
  AlertTriangle,
  CheckCircle2,
  EyeOff,
  Loader2,
  Save,
  XCircle,
} from "lucide-react";
import {
  type AuditItem,
  type AuditSession,
  type AuditSummary,
  calculateAuditSummary,
} from "./_components/types";
import { StocktakeTable } from "./_components/StocktakeTable";
import { ApprovalModal } from "./_components/ApprovalModal";
import { StocktakeKpiCards } from "./_components/StocktakeKpiCards";

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

  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isClosed = session.status === "approved" || session.status === "cancelled";

  const handleCountChange = (itemId: string, value: string) => {
    setCountInputs((prev) => ({ ...prev, [itemId]: value }));
  };

  const handleSaveCounts = async () => {
    const countsPayload = Object.entries(countInputs)
      .filter(([, val]) => val !== "" && !isNaN(Number(val)))
      .map(([itemId, val]) => ({
        itemId,
        countedQty: Math.max(0, parseInt(val, 10) || 0),
      }));

    if (countsPayload.length === 0) {
      setNotification({ type: "error", text: "No counts entered yet to save." });
      return;
    }

    setIsSaving(true);
    setNotification(null);

    try {
      const res = await recordStockAuditCountsAction({
        sessionId: session.id,
        counts: countsPayload,
      });

      if (res.success) {
        setNotification({
          type: "success",
          text: `Saved ${countsPayload.length} counted items. Session is now Under Review.`,
        });

        setItems((prev) => {
          const updated = prev.map((item) => {
            const countEntry = countsPayload.find((c) => c.itemId === item.id);
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
          });

          setSummary(calculateAuditSummary(updated));
          return updated;
        });

        setSession((prev) => ({ ...prev, status: "under_review" }));
      } else {
        setNotification({ type: "error", text: res.error || "Failed to save counts" });
      }
    } catch (err: unknown) {
      setNotification({ type: "error", text: err instanceof Error ? err.message : "Error saving counts" });
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
        setSession((prev) => ({
          ...prev,
          status: "approved",
          approvedAt: new Date().toISOString(),
        }));
        setShowApprovalModal(false);
        setNotification({
          type: "success",
          text: `Audit ${session.sessionNo} approved! ${res.reconciledAdjustmentsCount} inventory adjustments and balancing journal vouchers posted.`,
        });
      } else {
        setNotification({ type: "error", text: res.error || "Failed to reconcile session" });
      }
    } catch (err: unknown) {
      setNotification({ type: "error", text: err instanceof Error ? err.message : "Error approving session" });
    } finally {
      setIsApproving(false);
    }
  };

  const handleCancelSession = async () => {
    if (!confirm("Are you sure you want to cancel this audit session? Unsaved counts will be discarded.")) {
      return;
    }

    try {
      const res = await cancelStockAuditSessionAction({ sessionId: session.id });
      if (res.success) {
        setSession((prev) => ({ ...prev, status: "cancelled" }));
        setNotification({ type: "success", text: "Audit session cancelled." });
      } else {
        setNotification({ type: "error", text: res.error || "Failed to cancel session" });
      }
    } catch (err: unknown) {
      setNotification({ type: "error", text: err instanceof Error ? err.message : "Error cancelling session" });
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
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
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
      <div className="card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-ink-900 font-mono">
              {session.sessionNo}
            </h2>
            <span
              className={
                session.status === "approved"
                  ? "badge badge-success uppercase text-[10px]"
                  : session.status === "under_review"
                  ? "badge badge-warning uppercase text-[10px]"
                  : session.status === "in_progress"
                  ? "badge badge-info uppercase text-[10px]"
                  : "badge badge-neutral uppercase text-[10px]"
              }
            >
              {session.status.replace("_", " ")}
            </span>
            {session.blindCount && (
              <span className="badge badge-info text-[10.5px]">
                <EyeOff className="w-3 h-3" /> Blind Count
              </span>
            )}
          </div>
          <div className="text-xs text-ink-500 mt-1 flex flex-wrap gap-4">
            <span>Branch: <strong className="text-ink-800">{session.storeName}</strong></span>
            <span>Scope: <strong className="capitalize text-ink-800">{session.scope.replace("_", " ")}</strong></span>
            <span>Created: <strong className="text-ink-800">{typeof session.createdAt === "string" ? session.createdAt.slice(0, 10) : new Date(session.createdAt).toLocaleDateString()}</strong></span>
            {session.approvedAt && (
              <span>Approved: <strong className="text-ink-800">{typeof session.approvedAt === "string" ? session.approvedAt.slice(0, 10) : new Date(session.approvedAt).toLocaleDateString()}</strong></span>
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
                className="btn btn-secondary btn-sm"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Counts
              </button>

              <button
                type="button"
                onClick={() => setShowApprovalModal(true)}
                className="btn btn-primary btn-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve & Reconcile
              </button>

              <button
                type="button"
                onClick={handleCancelSession}
                className="btn btn-danger-ghost btn-sm btn-icon"
                title="Cancel Session"
                aria-label="Cancel Session"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Discrepancy KPI Summary */}
      <StocktakeKpiCards summary={summary} />

      {/* Count Sheet Table */}
      <StocktakeTable
        items={items}
        countInputs={countInputs}
        onCountChange={handleCountChange}
        isClosed={isClosed}
      />

      {/* Approval Confirmation Modal */}
      {showApprovalModal && (
        <ApprovalModal
          summary={summary}
          approvalNotes={approvalNotes}
          setApprovalNotes={setApprovalNotes}
          isApproving={isApproving}
          onClose={() => setShowApprovalModal(false)}
          onConfirm={handleApproveReconciliation}
        />
      )}
    </div>
  );
}
