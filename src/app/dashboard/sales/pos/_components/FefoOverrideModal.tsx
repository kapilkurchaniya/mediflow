"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { FEFO_OVERRIDE_REASONS, type FefoOverrideReasonCode } from "@/lib/fefo";
import type { SearchResultBatch } from "../_data/posData";

interface FefoOverrideModalProps {
  isOpen: boolean;
  medicineName: string;
  targetBatch: SearchResultBatch | null;
  skippedBatches: SearchResultBatch[];
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export function FefoOverrideModal({
  isOpen,
  medicineName,
  targetBatch,
  skippedBatches,
  onConfirm,
  onCancel,
}: FefoOverrideModalProps) {
  const [selectedCode, setSelectedCode] = useState<FefoOverrideReasonCode>("CUSTOMER_REQUEST");
  const [customNote, setCustomNote] = useState("");

  if (!isOpen || !targetBatch) return null;

  const handleConfirm = () => {
    const selectedItem = FEFO_OVERRIDE_REASONS.find((r) => r.code === selectedCode);
    const baseLabel = selectedItem ? selectedItem.label : selectedCode;
    const finalReason = selectedCode === "OTHER" && customNote.trim()
      ? `Other: ${customNote.trim()}`
      : baseLabel;

    onConfirm(finalReason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 backdrop-blur-xs p-4">
      <div className="card max-w-lg w-full p-5 space-y-4 shadow-pop animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-700 shrink-0 mt-0.5">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-ink-900 text-base">FEFO Override Compliance</h3>
            <p className="text-xs text-ink-500 mt-0.5">
              Dispensing a later-expiring batch over earlier available stock requires an audited reason.
            </p>
          </div>
        </div>

        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs space-y-2">
          <div className="font-semibold text-ink-800">{medicineName}</div>
          <div className="flex items-center gap-2 text-ink-600">
            <span className="font-medium text-amber-900">Selected:</span>
            <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-amber-200 text-ink-900">
              {targetBatch.batchNo}
            </span>
            <span>(Exp: {targetBatch.expiryDate})</span>
          </div>

          <div className="pt-1 border-t border-amber-200/60">
            <span className="font-medium text-amber-900">Skipped earlier batch(es):</span>
            <ul className="list-disc list-inside mt-1 space-y-0.5 font-mono text-ink-700 text-[11px]">
              {skippedBatches.map((b) => (
                <li key={b.id}>
                  {b.batchNo} (Exp: {b.expiryDate}, Stock: {b.qtyOnHand})
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-ink-700 block">
            Reason for Override <span className="text-rose-500">*</span>
          </label>
          <select
            value={selectedCode}
            onChange={(e) => setSelectedCode(e.target.value as FefoOverrideReasonCode)}
            className="select w-full text-xs font-medium"
          >
            {FEFO_OVERRIDE_REASONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>

          {selectedCode === "OTHER" && (
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Specify override reason..."
              maxLength={150}
              className="input w-full text-xs font-medium mt-1.5"
              autoFocus
            />
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary btn-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="btn btn-primary btn-sm !bg-amber-600 hover:!bg-amber-700 text-white"
          >
            Confirm Override
          </button>
        </div>
      </div>
    </div>
  );
}
