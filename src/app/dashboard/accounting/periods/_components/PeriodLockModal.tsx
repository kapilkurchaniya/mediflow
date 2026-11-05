"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Lock, Loader2, X } from "lucide-react";
import { formatINR } from "@/lib/format";
import { validatePeriodCloseAction, closePeriodAction } from "@/app/actions/accounting-periods";
import type { AccountingPeriod, PeriodValidationResult } from "@/server/domain/accounting-periods";

interface PeriodLockModalProps {
  period: AccountingPeriod | null;
  onClose: () => void;
  onLocked: () => void;
}

export function PeriodLockModal({ period, onClose, onLocked }: PeriodLockModalProps) {
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);
  const [validation, setValidation] = useState<PeriodValidationResult | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!period) return;
      try {
        const res = await validatePeriodCloseAction(period.id);
        if (!ignore) {
          if (res.success && res.data) {
            setValidation(res.data);
          } else {
            setError(res.error || "Failed to validate period closing");
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Error validating period");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [period]);

  if (!period) return null;

  async function handleLock() {
    if (!period || !reason.trim() || !validation?.canClose) return;
    setLocking(true);
    setError(null);
    try {
      const res = await closePeriodAction({
        periodId: period.id,
        reason: reason.trim(),
        force: false,
      });
      if (res.success) {
        onLocked();
        onClose();
      } else {
        setError(res.error || "Failed to lock period");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error closing period");
    } finally {
      setLocking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Lock Accounting Period</h2>
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
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
              <p className="mt-2 text-sm font-medium">Validating unposted records & ledger balances...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {validation && (
                <div>
                  {validation.canClose ? (
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 border border-emerald-200">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                      <span>Ready to lock. All records are posted and the ledger is balanced.</span>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800 border border-red-200 space-y-2">
                      <div className="flex items-center gap-2 font-medium">
                        <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
                        <span>Cannot lock period due to the following blockers:</span>
                      </div>
                      <ul className="list-inside list-disc text-xs space-y-1 text-red-700 pl-2">
                        {validation.blockers.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 text-center border">
                    <div>
                      <div className="text-xs text-gray-500">Journal Entries</div>
                      <div className="font-semibold text-gray-900">{validation.snapshot.totalJournalEntries}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Total Debits</div>
                      <div className="font-semibold text-gray-900">{formatINR(validation.snapshot.totalDebitPaise)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Total Credits</div>
                      <div className="font-semibold text-gray-900">{formatINR(validation.snapshot.totalCreditPaise)}</div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700">
                  Locking Reason / Closing Audit Note <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Monthly books finalised after physical stock reconciliation."
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={locking}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLock}
            disabled={loading || locking || !validation?.canClose || reason.trim().length < 3}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {locking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Confirm & Lock Period
          </button>
        </div>
      </div>
    </div>
  );
}
