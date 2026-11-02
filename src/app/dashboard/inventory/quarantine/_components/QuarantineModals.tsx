"use client";

import React from "react";
import { formatINR } from "@/lib/format";
import { CheckCircle2, FileCheck2, Loader2, ShieldAlert, X } from "lucide-react";
import type { ExpiryClaimItem, NearExpiryBatch } from "./types";

interface Props {
  // Quarantine Modal
  quarantineModalBatch: NearExpiryBatch | null;
  onCloseQuarantineModal: () => void;
  quarantineQty: number;
  setQuarantineQty: (q: number) => void;
  quarantineReason: "expired" | "damaged" | "recalled";
  setQuarantineReason: (r: "expired" | "damaged" | "recalled") => void;
  quarantineNotes: string;
  setQuarantineNotes: (n: string) => void;
  onConfirmQuarantine: () => void;

  // Settle Modal
  settleModalClaim: ExpiryClaimItem | null;
  onCloseSettleModal: () => void;
  settlementType: "credit_note" | "replacement_stock" | "written_off";
  setSettlementType: (t: "credit_note" | "replacement_stock" | "written_off") => void;
  creditNoteNo: string;
  setCreditNoteNo: (no: string) => void;
  settleNotes: string;
  setSettleNotes: (n: string) => void;
  onConfirmSettle: () => void;

  isSubmitting: boolean;
}

export function QuarantineModals({
  quarantineModalBatch,
  onCloseQuarantineModal,
  quarantineQty,
  setQuarantineQty,
  quarantineReason,
  setQuarantineReason,
  quarantineNotes,
  setQuarantineNotes,
  onConfirmQuarantine,

  settleModalClaim,
  onCloseSettleModal,
  settlementType,
  setSettlementType,
  creditNoteNo,
  setCreditNoteNo,
  settleNotes,
  setSettleNotes,
  onConfirmSettle,

  isSubmitting,
}: Props) {
  return (
    <>
      {/* Quarantine Modal */}
      {quarantineModalBatch && (
        <div className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-ink-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-ink-150 bg-ink-50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-600 font-semibold text-sm">
                <ShieldAlert className="w-5 h-5 shrink-0" />
                Isolate Stock to Quarantine
              </div>
              <button
                type="button"
                onClick={onCloseQuarantineModal}
                className="btn btn-ghost btn-icon h-7 w-7 text-ink-400 hover:text-ink-700"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-ink-50/80 p-3 rounded-lg border border-ink-150 space-y-1">
                <div className="font-bold text-ink-900 text-[13px]">
                  {quarantineModalBatch.medicineName}
                </div>
                <div className="text-ink-500 flex justify-between">
                  <span>Batch: <strong className="text-ink-800 font-mono">{quarantineModalBatch.batchNo}</strong></span>
                  <span>Expires: <strong className="text-ink-800">{quarantineModalBatch.expiryDate}</strong></span>
                </div>
                <div className="text-ink-500 flex justify-between">
                  <span>Distributor: {quarantineModalBatch.supplierName || "Unassigned"}</span>
                  <span>Available: <strong className="text-ink-800">{quarantineModalBatch.qtyOnHand}</strong></span>
                </div>
              </div>

              <div>
                <label className="label text-xs">Quantity to Quarantine</label>
                <input
                  type="number"
                  min={1}
                  max={quarantineModalBatch.qtyOnHand}
                  value={quarantineQty}
                  onChange={(e) => setQuarantineQty(Number(e.target.value))}
                  className="input input-sm font-semibold"
                />
              </div>

              <div>
                <label className="label text-xs">Reason for Quarantine</label>
                <select
                  value={quarantineReason}
                  onChange={(e) => setQuarantineReason(e.target.value as "expired" | "damaged" | "recalled")}
                  aria-label="Reason for quarantining stock"
                  className="input input-sm"
                >
                  <option value="expired">Expired Date Surpassed</option>
                  <option value="damaged">Damaged / Broken Packaging</option>
                  <option value="recalled">Manufacturer / Regulatory Recall</option>
                </select>
              </div>

              <div>
                <label className="label text-xs">Notes / Dump Memo</label>
                <textarea
                  rows={2}
                  value={quarantineNotes}
                  onChange={(e) => setQuarantineNotes(e.target.value)}
                  placeholder="Optional audit notes regarding packaging or supplier communication..."
                  className="input input-sm py-2 leading-relaxed"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-ink-50/50 border-t border-ink-150 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCloseQuarantineModal}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmQuarantine}
                disabled={isSubmitting || quarantineQty <= 0}
                className="btn btn-sm text-white bg-rose-600 hover:bg-rose-700"
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
        <div className="fixed inset-0 z-50 bg-ink-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-ink-200 rounded-xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-ink-150 bg-ink-50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-brand-700 font-semibold text-sm">
                <FileCheck2 className="w-5 h-5 shrink-0" />
                Settle Distributor Debit Claim
              </div>
              <button
                type="button"
                onClick={onCloseSettleModal}
                className="btn btn-ghost btn-icon h-7 w-7 text-ink-400 hover:text-ink-700"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-ink-50/80 p-3 rounded-lg border border-ink-150 space-y-1">
                <div className="font-bold text-ink-900 font-mono text-[13px]">
                  Claim #{settleModalClaim.claimNo}
                </div>
                <div className="text-ink-500 flex justify-between">
                  <span>Distributor: {settleModalClaim.supplierName}</span>
                  <span className="font-semibold text-ink-900">Amount: {formatINR(settleModalClaim.totalPaise)}</span>
                </div>
              </div>

              <div>
                <label className="label text-xs">Settlement Resolution Type</label>
                <select
                  value={settlementType}
                  onChange={(e) => setSettlementType(e.target.value as "credit_note" | "replacement_stock" | "written_off")}
                  aria-label="Settlement resolution type"
                  className="input input-sm"
                >
                  <option value="credit_note">Distributor Credit Note (Balance deduction)</option>
                  <option value="replacement_stock">Physical Replacement Goods Received</option>
                  <option value="written_off">Claim Rejected / Write-Off Loss</option>
                </select>
              </div>

              {settlementType === "credit_note" && (
                <div>
                  <label className="label text-xs">Distributor Credit Note Number</label>
                  <input
                    type="text"
                    value={creditNoteNo}
                    onChange={(e) => setCreditNoteNo(e.target.value)}
                    placeholder="e.g. CN/2026/884"
                    className="input input-sm font-mono"
                  />
                </div>
              )}

              <div>
                <label className="label text-xs">Settlement Remarks / Voucher Notes</label>
                <textarea
                  rows={2}
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  placeholder="Record supplier ledger reconciliation details..."
                  className="input input-sm py-2 leading-relaxed"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-ink-50/50 border-t border-ink-150 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCloseSettleModal}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmSettle}
                disabled={isSubmitting}
                className="btn btn-primary btn-sm"
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
    </>
  );
}
