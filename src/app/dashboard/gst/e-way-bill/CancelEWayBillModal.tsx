"use client";

import { useState } from "react";
import { ShieldAlert, X, Ban, Loader2 } from "lucide-react";
import { cancelEWayBillAction } from "@/app/actions/gst";
import type { EWayBillItem } from "./types";

interface CancelEWayBillModalProps {
  cancelDoc: EWayBillItem;
  onClose: () => void;
  onSuccess: () => void;
}

export function CancelEWayBillModal({
  cancelDoc,
  onClose,
  onSuccess,
}: CancelEWayBillModalProps) {
  const [cancelReasonCode, setCancelReasonCode] = useState<"1" | "2" | "3" | "4">("2");
  const [cancelRemarks, setCancelRemarks] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function handleCancelEwb() {
    setCancelling(true);
    try {
      const res = await cancelEWayBillAction(
        cancelDoc.id,
        cancelReasonCode,
        cancelRemarks.trim() || "Order cancelled by consignor",
      );

      if ("error" in res && res.error) {
        alert("Failed to cancel E-Way Bill: " + res.error);
      } else {
        onSuccess();
      }
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-xl border border-ink-150 bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-rose-50 p-2 text-rose-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink-900">Cancel E-Way Bill</h3>
              <p className="text-xs text-ink-500">CGST Rule 138(9) Statutory Window</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-600 rounded-lg p-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 space-y-1 border border-amber-200">
          <p className="font-medium">⚠️ Statutory Rule Notice:</p>
          <p>
            E-Way Bills can only be cancelled within <strong>24 hours of generation</strong>, provided the
            consignment has not been verified in transit by tax authorities.
          </p>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-ink-700 mb-1">
              Cancellation Reason Code *
            </label>
            <select
              value={cancelReasonCode}
              onChange={(e) => setCancelReasonCode(e.target.value as "1" | "2" | "3" | "4")}
              className="select w-full bg-white text-xs"
            >
              <option value="2">2 - Order / Consignment Cancelled</option>
              <option value="1">1 - Duplicate E-Way Bill Generated</option>
              <option value="3">3 - Data Entry Mistake in Part-A</option>
              <option value="4">4 - Others</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-ink-700 mb-1">
              Cancellation Remarks *
            </label>
            <textarea
              rows={2}
              placeholder="Explain why this transit document is being cancelled..."
              value={cancelRemarks}
              onChange={(e) => setCancelRemarks(e.target.value)}
              className="input w-full bg-white min-h-[60px]"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs"
          >
            Close
          </button>
          <button
            type="button"
            disabled={cancelling}
            onClick={handleCancelEwb}
            className="rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50 flex items-center gap-1.5 shadow-2xs transition-colors"
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
}

