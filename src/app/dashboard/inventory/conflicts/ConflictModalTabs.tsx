"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ClipboardList, ArrowRightLeft, Truck, Ban } from "lucide-react";
import {
  resolveConflictRecountAction,
  resolveConflictReallocationAction,
  dismissConflictCaseAction,
} from "@/app/actions/conflicts";
import type { ConflictDetailsData, AlternativeBatchItem } from "./types";

interface ConflictModalTabsProps {
  conflictCaseId: string;
  data: ConflictDetailsData;
  onSuccess: () => void;
  onError: (err: string) => void;
}

export function ConflictModalTabs({
  conflictCaseId,
  data,
  onSuccess,
  onError,
}: ConflictModalTabsProps) {
  const [activeTab, setActiveTab] = useState<"recount" | "reallocate" | "transfer" | "dismiss">(
    "recount",
  );
  const [submitting, setSubmitting] = useState(false);
  const [observedCount, setObservedCount] = useState<number>(0);
  const [recountNotes, setRecountNotes] = useState("");
  const [targetBatchId, setTargetBatchId] = useState(data.alternativeBatches[0]?.id || "");
  const [reallocateQty, setReallocateQty] = useState<number>(
    data.conflictCase.outstandingQty > 0 ? data.conflictCase.outstandingQty : 1,
  );
  const [dispensingEvidence, setDispensingEvidence] = useState("");
  const [dismissReason, setDismissReason] = useState("");

  const handleRecount = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await resolveConflictRecountAction({
      conflictCaseId,
      observedCount: Number(observedCount),
      notes: recountNotes,
    });
    setSubmitting(false);
    if (res.success) onSuccess();
    else onError(res.error || "Failed to submit recount");
  };

  const handleReallocate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await resolveConflictReallocationAction({
      conflictCaseId,
      targetBatchId,
      reallocateQty: Number(reallocateQty),
      dispensingEvidence,
    });
    setSubmitting(false);
    if (res.success) onSuccess();
    else onError(res.error || "Failed to reallocate batch");
  };

  const handleDismiss = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await dismissConflictCaseAction({ conflictCaseId, reason: dismissReason });
    setSubmitting(false);
    if (res.success) onSuccess();
    else onError(res.error || "Failed to dismiss case");
  };

  return (
    <div className="space-y-4">
      {/* Navigation Tabs */}
      <div className="flex border-b border-ink-150 gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("recount")}
          className={`pb-2 text-xs font-medium border-b-2 flex items-center gap-1.5 px-2 transition-colors ${
            activeTab === "recount"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-ink-500 hover:text-ink-700"
          }`}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          Physical Recount
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reallocate")}
          className={`pb-2 text-xs font-medium border-b-2 flex items-center gap-1.5 px-2 transition-colors ${
            activeTab === "reallocate"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-ink-500 hover:text-ink-700"
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          Reallocate Batch
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("transfer")}
          className={`pb-2 text-xs font-medium border-b-2 flex items-center gap-1.5 px-2 transition-colors ${
            activeTab === "transfer"
              ? "border-emerald-600 text-emerald-600"
              : "border-transparent text-ink-500 hover:text-ink-700"
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          Branch Transfer
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("dismiss")}
          className={`pb-2 text-xs font-medium border-b-2 flex items-center gap-1.5 px-2 transition-colors ${
            activeTab === "dismiss"
              ? "border-rose-600 text-rose-600"
              : "border-transparent text-ink-500 hover:text-ink-700"
          }`}
        >
          <Ban className="w-3.5 h-3.5" />
          Dismiss
        </button>
      </div>

      {activeTab === "recount" && (
        <form onSubmit={handleRecount} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">
              Observed Physical Count on Shelf
            </label>
            <input
              type="number"
              min="0"
              value={observedCount}
              onChange={(e) => setObservedCount(parseInt(e.target.value) || 0)}
              className="input w-full text-sm bg-white"
              required
            />
            <p className="text-xs text-ink-500 mt-1">
              {observedCount > 0
                ? `Discovered +${observedCount - data.conflictCase.qtyOnHand} units. Ledger updates to ${observedCount}.`
                : "Confirmed 0 physical shelf stock. Squares ledger balance with an audited variance adjustment."}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">
              Recount Notes
            </label>
            <input
              type="text"
              value={recountNotes}
              onChange={(e) => setRecountNotes(e.target.value)}
              placeholder="e.g. Physical inventory verified by store manager"
              className="input w-full text-sm bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary w-full py-2 px-4 text-xs font-semibold shadow-2xs"
          >
            {submitting ? "Applying Recount..." : "Apply Physical Recount"}
          </button>
        </form>
      )}

      {activeTab === "reallocate" && (
        <form onSubmit={handleReallocate} className="space-y-3">
          {data.alternativeBatches.length === 0 ? (
            <div className="py-4 text-center text-xs text-ink-500">
              No alternative in-stock active batches found for this medicine in this store.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Source Surplus Batch
                </label>
                <select
                  value={targetBatchId}
                  onChange={(e) => setTargetBatchId(e.target.value)}
                  className="select w-full text-sm bg-white"
                  required
                >
                  {data.alternativeBatches.map((b: AlternativeBatchItem) => (
                    <option key={b.id} value={b.id}>
                      Batch #{b.batchNo} · {b.qtyOnHand} available · Exp: {b.expiryDate}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Quantity to Reallocate
                </label>
                <input
                  type="number"
                  min="1"
                  max={data.conflictCase.outstandingQty}
                  value={reallocateQty}
                  onChange={(e) => setReallocateQty(parseInt(e.target.value) || 1)}
                  className="input w-full text-sm bg-white"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Dispensing Evidence (Required)
                </label>
                <textarea
                  rows={2}
                  value={dispensingEvidence}
                  onChange={(e) => setDispensingEvidence(e.target.value)}
                  placeholder="Explain physical dispensing substitution (e.g. barcode mis-scan)"
                  className="input w-full text-sm bg-white min-h-[60px]"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary w-full py-2 px-4 text-xs font-semibold shadow-2xs"
              >
                {submitting ? "Reallocating..." : "Execute Batch Reallocation"}
              </button>
            </>
          )}
        </form>
      )}

      {activeTab === "transfer" && (
        <div className="space-y-3 text-xs text-ink-600">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="font-semibold text-blue-900">
              Receipt-Driven Stock Reconciliation
            </p>
            <p className="mt-1">
              Dispatch a transfer for <strong>{data.conflictCase.medicineName}</strong> to this store.
            </p>
            <p className="mt-1">
              When received at the store under <strong>Receive Transfer</strong>, the verified accepted units automatically credit this conflict case.
            </p>
          </div>
          <Link
            href="/dashboard/inventory/transfers"
            className="btn btn-secondary block text-center py-2 px-4 font-medium"
          >
            Open Stock Transfers Hub &rarr;
          </Link>
        </div>
      )}

      {activeTab === "dismiss" && (
        <form onSubmit={handleDismiss} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">
              Dismissal Reason (Required)
            </label>
            <textarea
              rows={2}
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="Audit justification for closing this conflict case without adjustments"
              className="input w-full text-sm bg-white min-h-[60px]"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
          >
            {submitting ? "Dismissing..." : "Dismiss Conflict Case"}
          </button>
        </form>
      )}
    </div>
  );
}
