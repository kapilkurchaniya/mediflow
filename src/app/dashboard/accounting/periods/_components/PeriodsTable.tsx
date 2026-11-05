"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Lock, Unlock, History, CheckCircle2, ShieldAlert } from "lucide-react";
import { formatINR } from "@/lib/format";
import { PeriodLockModal } from "./PeriodLockModal";
import { PeriodReopenModal } from "./PeriodReopenModal";
import { PeriodAuditModal } from "./PeriodAuditModal";
import type { AccountingPeriod, PeriodSnapshot } from "@/server/domain/accounting-periods";

interface PeriodsTableProps {
  initialPeriods: AccountingPeriod[];
  distinctGstins: string[];
  currentFY: string;
}

export function PeriodsTable({ initialPeriods, distinctGstins, currentFY }: PeriodsTableProps) {
  const [periods, setPeriods] = useState<AccountingPeriod[]>(initialPeriods);
  const [selectedGstin, setSelectedGstin] = useState<string>("all");

  const [lockingPeriod, setLockingPeriod] = useState<AccountingPeriod | null>(null);
  const [reopeningPeriod, setReopeningPeriod] = useState<AccountingPeriod | null>(null);
  const [auditPeriod, setAuditPeriod] = useState<AccountingPeriod | null>(null);

  const filtered = periods.filter((p) => {
    if (selectedGstin === "all") return true;
    if (selectedGstin === "master") return p.gstin === null;
    return p.gstin === selectedGstin;
  });

  function refreshList() {
    window.location.reload();
  }

  return (
    <div className="space-y-4">
      {/* Scope Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Scope Filter:
          </label>
          <select
            value={selectedGstin}
            onChange={(e) => setSelectedGstin(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="all">All Scopes (Master & Branch GSTINs)</option>
            <option value="master">Tenant Master Only</option>
            {distinctGstins.map((g) => (
              <option key={g} value={g}>
                GSTIN: {g}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <span>Open: {periods.filter((p) => p.status === "open").length}</span>
          <span className="mx-1">·</span>
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          <span>Locked: {periods.filter((p) => p.status === "locked").length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="border-b border-gray-200 bg-gray-50/75 text-xs font-semibold text-gray-700">
            <tr>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Date Range</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Closing Snapshot</th>
              <th className="px-4 py-3">Locked Detail</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-400">
                  No accounting periods found for the selected scope.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const isLocked = p.status === "locked";
                const snapshot = p.closingSnapshot as unknown as PeriodSnapshot | null;

                return (
                  <tr key={p.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{p.periodKey}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {p.startDate} to {p.endDate}
                    </td>
                    <td className="px-4 py-3">
                      {p.gstin ? (
                        <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 border border-purple-200">
                          GSTIN: {p.gstin}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                          Tenant Master
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isLocked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-200">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Open
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {snapshot ? (
                        <div>
                          <div className="font-medium text-gray-900">
                            {snapshot.totalJournalEntries} JVs · {formatINR(snapshot.totalDebitPaise)}
                          </div>
                          <div className="text-gray-400">Balanced debit & credit</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {isLocked && p.lockedAt ? (
                        <div>
                          <div className="text-gray-700">{format(new Date(p.lockedAt), "dd MMM yyyy, hh:mm a")}</div>
                          {p.lockNote && <div className="text-gray-400 truncate max-w-xs">{p.lockNote}</div>}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isLocked ? (
                          <button
                            type="button"
                            onClick={() => setReopeningPeriod(p)}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
                          >
                            <Unlock className="h-3.5 w-3.5" /> Reopen
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setLockingPeriod(p)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                          >
                            <Lock className="h-3.5 w-3.5" /> Lock Period
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setAuditPeriod(p)}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          <History className="h-3.5 w-3.5" /> Audit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      <PeriodLockModal
        period={lockingPeriod}
        onClose={() => setLockingPeriod(null)}
        onLocked={refreshList}
      />
      <PeriodReopenModal
        period={reopeningPeriod}
        onClose={() => setReopeningPeriod(null)}
        onReopened={refreshList}
      />
      <PeriodAuditModal
        period={auditPeriod}
        onClose={() => setAuditPeriod(null)}
      />
    </div>
  );
}
