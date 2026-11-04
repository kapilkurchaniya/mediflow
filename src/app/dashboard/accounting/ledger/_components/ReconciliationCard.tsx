"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, FileSpreadsheet } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { ReconciliationReport } from "@/server/domain/accounting-reports";

interface ReconciliationCardProps {
  reconciliation: ReconciliationReport;
}

export function ReconciliationCard({ reconciliation }: ReconciliationCardProps) {
  const [showUnattributed, setShowUnattributed] = useState(false);

  const {
    account,
    partyType,
    partyName,
    controlDebit,
    controlCredit,
    controlNet,
    subledgerDebit,
    subledgerCredit,
    subledgerNet,
    unattributedDebit,
    unattributedCredit,
    unattributedNet,
    debitVariance,
    creditVariance,
    netVariance,
    isReconciled,
    unattributedCount,
    unattributedPostings,
  } = reconciliation;

  return (
    <div className="card bg-white border border-slate-200 shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3.5 bg-slate-50/70 border-b border-slate-200/80 gap-3">
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet className="w-4 h-4 text-slate-600" />
          <span className="font-semibold text-slate-800 text-xs">
            {partyType === "customer" ? "Debtor Control Account (1050)" : "Creditor Control Account (2010)"} Reconciliation
          </span>
          {partyName && (
            <span className="badge badge-sm badge-outline text-[11px] font-medium text-slate-700">
              Filtered: {partyName}
            </span>
          )}
        </div>
        <div>
          {isReconciled ? (
            <span className="badge badge-sm badge-success gap-1 text-[11px] font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled (Exact Match)
            </span>
          ) : (
            <span className="badge badge-sm badge-warning gap-1 text-[11px] font-medium">
              <AlertCircle className="w-3.5 h-3.5" /> Unattributed Postings Detected
            </span>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        {/* Control Account */}
        <div className="space-y-1 sm:pr-4">
          <div className="text-slate-500 font-medium">Control Account Total</div>
          <div className="font-mono font-bold text-slate-900 text-sm">{formatINR(Math.abs(controlNet))} {account.normalSide.toUpperCase()}</div>
          <div className="text-[11px] text-slate-400">
            Dr: {formatINR(controlDebit)} • Cr: {formatINR(controlCredit)}
          </div>
        </div>

        {/* Attributed Subledger */}
        <div className="space-y-1 sm:px-4 pt-2 sm:pt-0">
          <div className="text-slate-500 font-medium">Attributed Subledger</div>
          <div className="font-mono font-bold text-emerald-700 text-sm">{formatINR(Math.abs(subledgerNet))} {account.normalSide.toUpperCase()}</div>
          <div className="text-[11px] text-slate-400">
            Dr: {formatINR(subledgerDebit)} • Cr: {formatINR(subledgerCredit)}
          </div>
        </div>

        {/* Unattributed Postings */}
        <div className="space-y-1 sm:pl-4 pt-2 sm:pt-0">
          <div className="text-slate-500 font-medium">Unattributed Postings</div>
          <div className={`font-mono font-bold text-sm ${unattributedCount > 0 ? "text-amber-600" : "text-slate-600"}`}>
            {formatINR(Math.abs(unattributedNet))} ({unattributedCount} vouchers)
          </div>
          <div className="text-[11px] text-slate-400">
            Dr: {formatINR(unattributedDebit)} • Cr: {formatINR(unattributedCredit)}
          </div>
        </div>
      </div>

      {/* Discrepancy Diagnostics Alert if any variance */}
      {(debitVariance !== 0 || creditVariance !== 0 || netVariance !== 0) && (
        <div className="px-5 py-2.5 bg-rose-50 border-t border-rose-100 text-xs text-rose-800 flex items-center justify-between">
          <span>
            Variance Alert: Dr diff: {formatINR(debitVariance)} • Cr diff: {formatINR(creditVariance)} • Net diff: {formatINR(netVariance)}
          </span>
          <span className="text-[11px] text-rose-600 font-medium">Requires audit review</span>
        </div>
      )}

      {/* Unattributed Drawer Toggle */}
      {unattributedCount > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/40">
          <button
            onClick={() => setShowUnattributed(!showUnattributed)}
            className="w-full px-5 py-2 text-left text-xs text-slate-600 hover:text-slate-900 flex items-center justify-between"
          >
            <span className="font-medium">
              {showUnattributed ? "Hide" : "Inspect"} Unattributed Historical Postings ({unattributedCount})
            </span>
            {showUnattributed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showUnattributed && (
            <div className="px-5 pb-3">
              <div className="border border-slate-200 rounded-md overflow-hidden bg-white">
                <table className="table table-xs w-full">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th>Date</th>
                      <th>Voucher No</th>
                      <th>Narration</th>
                      <th className="text-right">Debit (₹)</th>
                      <th className="text-right">Credit (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {unattributedPostings.map((p) => (
                      <tr key={p.entryId}>
                        <td className="font-mono text-slate-500">{p.entryDate}</td>
                        <td className="font-mono font-medium text-slate-800">{p.entryNo}</td>
                        <td className="text-slate-600 max-w-xs truncate">{p.narration}</td>
                        <td className="text-right font-mono text-slate-900">{p.debit > 0 ? formatINR(p.debit) : "—"}</td>
                        <td className="text-right font-mono text-slate-900">{p.credit > 0 ? formatINR(p.credit) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
