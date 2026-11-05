"use client";

import { useEffect, useState } from "react";
import { History, Loader2, Lock, Unlock, X } from "lucide-react";
import { format } from "date-fns";
import { formatINR } from "@/lib/format";
import { getPeriodAuditHistoryAction } from "@/app/actions/accounting-periods";
import type { AccountingPeriod, AccountingPeriodEvent, PeriodSnapshot } from "@/server/domain/accounting-periods";

interface PeriodAuditModalProps {
  period: AccountingPeriod | null;
  onClose: () => void;
}

export function PeriodAuditModal({ period, onClose }: PeriodAuditModalProps) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AccountingPeriodEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!period) return;
      try {
        const res = await getPeriodAuditHistoryAction(period.id);
        if (!ignore) {
          if (res.success && res.data) {
            setEvents(res.data);
          } else {
            setError(res.error || "Failed to load audit history");
          }
        }
      } catch (err: unknown) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Error loading audit history");
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Period Audit Timeline</h2>
              <p className="text-xs text-gray-500">
                Period {period.periodKey} ({period.financialYear}) {period.gstin ? `· GSTIN: ${period.gstin}` : "· Tenant Master"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 max-h-[60vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
              <p className="mt-2 text-sm">Loading audit events...</p>
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : events.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              No lock/reopen audit events have been recorded for this period yet.
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((evt) => {
                const snapshot = evt.snapshot as unknown as PeriodSnapshot;
                const isLock = evt.eventType === "lock";

                return (
                  <div key={evt.id} className="relative rounded-lg border border-gray-200 bg-gray-50/50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isLock
                              ? "bg-amber-100 text-amber-800 border border-amber-200"
                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          {isLock ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                          {isLock ? "Locked" : "Reopened"} (Seq #{evt.eventSequence})
                        </span>
                        <span className="text-xs text-gray-400">
                          {format(new Date(evt.performedAt), "dd MMM yyyy, hh:mm a")}
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-sm text-gray-800">
                      <span className="font-medium text-gray-900">Reason:</span> {evt.reason}
                    </p>

                    {snapshot && (
                      <div className="mt-3 grid grid-cols-3 gap-2 rounded bg-white p-2.5 text-xs border text-center">
                        <div>
                          <div className="text-gray-400">Journal Entries</div>
                          <div className="font-medium text-gray-900">{snapshot.totalJournalEntries ?? 0}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Total Debits</div>
                          <div className="font-medium text-gray-900">{formatINR(snapshot.totalDebitPaise ?? 0)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Total Credits</div>
                          <div className="font-medium text-gray-900">{formatINR(snapshot.totalCreditPaise ?? 0)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
