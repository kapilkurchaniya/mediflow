"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { formatINR } from "@/lib/format";
import type { DayBookEntryRow } from "@/server/domain/accounting-reports";

interface JournalEntryModalProps {
  entry: DayBookEntryRow | null;
  onClose: () => void;
}

export function getSourceRoute(refType: string | null, refId: string | null): string | null {
  if (!refId) return null;
  switch (refType) {
    case "sale":
      return `/dashboard/sales/${refId}`;
    case "sale_return":
      return `/dashboard/sales/returns/${refId}`;
    case "purchase":
      return `/dashboard/purchases/${refId}`;
    case "purchase_return":
      return `/dashboard/purchases/returns/${refId}`;
    case "expense":
      return `/dashboard/accounting/expenses`;
    case "payment":
    case "receipt":
      return `/dashboard/accounting`;
    default:
      return null;
  }
}

export function JournalEntryModal({ entry, onClose }: JournalEntryModalProps) {
  if (!entry) return null;

  const sourceUrl = getSourceRoute(entry.refType, entry.refId);
  const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
  const isBalanced = totalDebit === totalCredit;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in-0 zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold text-slate-800">{entry.entryNo}</span>
              <span className="badge badge-sm badge-outline uppercase tracking-wider text-[10px]">
                {entry.refType ?? "journal"}
              </span>
              {isBalanced ? (
                <span className="badge badge-sm badge-success gap-1 text-[11px]">
                  <CheckCircle2 className="w-3 h-3" /> Balanced
                </span>
              ) : (
                <span className="badge badge-sm badge-error gap-1 text-[11px]">
                  <AlertTriangle className="w-3 h-3" /> Out of Balance
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Date: {entry.entryDate} • Store: {entry.storeName ?? "Unallocated / Tenant-Wide"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-xs btn-circle text-slate-400 hover:text-slate-600"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Narration & Source Drill-down */}
          <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200/80 text-xs flex items-center justify-between gap-4">
            <div>
              <span className="font-medium text-slate-600">Narration: </span>
              <span className="text-slate-900">{entry.narration || "No narration provided"}</span>
            </div>
            {sourceUrl ? (
              <Link
                href={sourceUrl}
                className="btn btn-xs btn-primary gap-1 shrink-0"
                target="_blank"
                rel="noreferrer"
              >
                <span>View Source</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            ) : (
              <span className="badge badge-sm badge-ghost text-slate-500 text-[11px] shrink-0">
                Unavailable Source
              </span>
            )}
          </div>

          {/* Lines Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="table table-xs w-full">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th>Account Code</th>
                  <th>Account Name</th>
                  <th>Party</th>
                  <th className="text-right">Debit (₹)</th>
                  <th className="text-right">Credit (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entry.lines.map((line) => (
                  <tr key={line.id} className="hover:bg-slate-50/50">
                    <td className="font-mono text-slate-500 font-medium">{line.accountCode}</td>
                    <td className="font-medium text-slate-800">
                      <Link
                        href={`/dashboard/accounting/ledger/${line.accountId}`}
                        className="text-primary hover:underline"
                        onClick={onClose}
                      >
                        {line.accountName}
                      </Link>
                    </td>
                    <td className="text-slate-600">{line.partyName ?? "—"}</td>
                    <td className="text-right font-mono text-slate-900">
                      {line.debit > 0 ? formatINR(line.debit) : "—"}
                    </td>
                    <td className="text-right font-mono text-slate-900">
                      {line.credit > 0 ? formatINR(line.credit) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50/80 font-bold border-t border-slate-200">
                <tr>
                  <td colSpan={3} className="text-right">Totals:</td>
                  <td className="text-right font-mono text-slate-900">{formatINR(totalDebit)}</td>
                  <td className="text-right font-mono text-slate-900">{formatINR(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/30 flex justify-end">
          <button onClick={onClose} className="btn btn-sm btn-outline">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
