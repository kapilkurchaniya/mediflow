"use client";

import React from "react";
import { formatINR } from "@/lib/format";
import { CheckCircle2, FileCheck2, Loader2, X } from "lucide-react";
import type { AuditSummary } from "./types";

interface Props {
  summary: AuditSummary;
  approvalNotes: string;
  setApprovalNotes: (notes: string) => void;
  isApproving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ApprovalModal({
  summary,
  approvalNotes,
  setApprovalNotes,
  isApproving,
  onClose,
  onConfirm,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-ink-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-ink-150 bg-ink-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-brand-700 font-semibold text-sm">
            <FileCheck2 className="w-5 h-5 shrink-0" />
            Approve & Reconcile Physical Stocktake
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon h-7 w-7 text-ink-400 hover:text-ink-700"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <p className="text-ink-600 leading-relaxed">
            Approving this session will adjust the live inventory on hand to match the physical counts,
            write immutable audit trail stock movements, and post balanced GL vouchers.
          </p>

          <div className="bg-ink-50/80 p-3.5 rounded-lg border border-ink-150 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-ink-500">Shortage Discrepancies:</span>
              <strong className="text-rose-600 font-mono">
                -{formatINR(summary.totalShortageCostPaise)} ({summary.shortageLines} items)
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500">Excess Discrepancies:</span>
              <strong className="text-emerald-600 font-mono">
                +{formatINR(summary.totalExcessCostPaise)} ({summary.excessLines} items)
              </strong>
            </div>
            <div className="pt-1.5 border-t border-ink-150 flex justify-between font-bold text-ink-900">
              <span>Net Ledger Impact:</span>
              <span className={`font-mono ${summary.netVarianceCostPaise < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {formatINR(Math.abs(summary.netVarianceCostPaise))}{" "}
                <span className="font-normal text-[11px]">
                  {summary.netVarianceCostPaise < 0 ? "(Expense / Loss)" : "(Gain)"}
                </span>
              </span>
            </div>
          </div>

          <div>
            <label className="label text-xs">Reconciliation Sign-Off Notes</label>
            <textarea
              rows={2}
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="Record verification notes or reason for discrepancies..."
              className="input input-sm py-2 leading-relaxed"
            />
          </div>
        </div>

        <div className="px-5 py-3.5 bg-ink-50/50 border-t border-ink-150 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isApproving}
            className="btn btn-primary btn-sm"
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
  );
}
