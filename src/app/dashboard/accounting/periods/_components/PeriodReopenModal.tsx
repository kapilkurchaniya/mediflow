"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Unlock, X } from "lucide-react";
import { reopenPeriodAction } from "@/app/actions/accounting-periods";
import type { AccountingPeriod } from "@/server/domain/accounting-periods";

interface PeriodReopenModalProps {
  period: AccountingPeriod | null;
  onClose: () => void;
  onReopened: () => void;
}

export function PeriodReopenModal({ period, onClose, onReopened }: PeriodReopenModalProps) {
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!period) return null;

  async function handleReopen() {
    if (!period || reason.trim().length < 5) return;
    setReopening(true);
    setError(null);
    try {
      const res = await reopenPeriodAction({
        periodId: period.id,
        reason: reason.trim(),
      });
      if (res.success) {
        onReopened();
        onClose();
      } else {
        setError(res.error || "Failed to reopen period");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error reopening period");
    } finally {
      setReopening(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
              <Unlock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Reopen Accounting Period</h2>
              <p className="text-xs text-gray-500">
                Period: {period.periodKey} ({period.startDate} to {period.endDate})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 border border-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium">Caution: Audit Trail Warning</p>
              <p className="text-xs text-amber-800 mt-1">
                Reopening an accounting period unlocks postings and financial adjustments for past dates.
                An immutable audit event with the full snapshot will be recorded permanently.
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
              Formal Justification / Audit Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Audit adjustment required for late supplier credit note CN-402."
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            <p className="mt-1 text-xs text-gray-400">Minimum 5 characters required for compliance audit.</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={reopening}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleReopen}
            disabled={reopening || reason.trim().length < 5}
            className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {reopening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
            Confirm & Reopen Period
          </button>
        </div>
      </div>
    </div>
  );
}
