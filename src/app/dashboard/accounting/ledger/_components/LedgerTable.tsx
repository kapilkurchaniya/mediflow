"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatINR } from "@/lib/format";
import type { LedgerReport } from "@/server/domain/accounting-reports";
import { getSourceRoute } from "../../day-book/_components/JournalEntryModal";

interface LedgerTableProps {
  report: LedgerReport;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
}

export function LedgerTable({ report, onLoadMore, isLoadingMore }: LedgerTableProps) {
  const {
    account,
    periodOpeningBalance,
    periodOpeningSide,
    rows,
    periodDebitTotal,
    periodCreditTotal,
    periodClosingBalance,
    periodClosingSide,
    hasMore,
  } = report;

  return (
    <div className="card bg-white border border-slate-200 overflow-hidden shadow-xs">
      <div className="overflow-x-auto">
        <table className="table table-sm w-full">
          <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-xs">
            <tr>
              <th>Date</th>
              <th>Voucher No</th>
              <th>Type</th>
              <th>Particulars</th>
              <th className="text-right">Debit (₹)</th>
              <th className="text-right">Credit (₹)</th>
              <th className="text-right">Running Balance (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {/* 1. Opening Balance Row */}
            <tr className="bg-slate-50/60 font-semibold text-slate-700">
              <td colSpan={4} className="py-2.5">
                <span className="text-slate-500 font-normal">Beginning Position: </span>
                Opening Balance
              </td>
              <td className="text-right font-mono text-slate-400">—</td>
              <td className="text-right font-mono text-slate-400">—</td>
              <td className="text-right font-mono text-slate-900">
                {formatINR(periodOpeningBalance)}{" "}
                <span className="text-[10px] uppercase font-bold text-slate-500">
                  {periodOpeningSide}
                </span>
              </td>
            </tr>

            {/* 2. Transaction Lines */}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-slate-400">
                  No transaction movements in this period.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const sourceUrl = getSourceRoute(row.voucherType, row.refId);
                return (
                  <tr key={row.lineId} className="hover:bg-slate-50/50 transition-colors">
                    <td className="font-mono text-slate-600 whitespace-nowrap">{row.entryDate}</td>
                    <td>
                      {sourceUrl ? (
                        <Link
                          href={sourceUrl}
                          className="font-mono font-medium text-primary hover:underline"
                        >
                          {row.entryNo}
                        </Link>
                      ) : (
                        <span className="font-mono font-medium text-slate-800">{row.entryNo}</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-sm badge-ghost uppercase tracking-wider text-[10px]">
                        {row.voucherType ?? "journal"}
                      </span>
                    </td>
                    <td className="max-w-xs truncate text-slate-800 font-medium" title={row.particulars}>
                      {row.particulars}
                    </td>
                    <td className="text-right font-mono text-slate-900">
                      {row.debit > 0 ? formatINR(row.debit) : "—"}
                    </td>
                    <td className="text-right font-mono text-slate-900">
                      {row.credit > 0 ? formatINR(row.credit) : "—"}
                    </td>
                    <td className="text-right font-mono font-medium text-slate-900">
                      {formatINR(row.runningBalance)}{" "}
                      <span
                        className={`text-[10px] uppercase font-bold ${
                          row.runningSide === account.normalSide ? "text-slate-600" : "text-amber-600"
                        }`}
                      >
                        {row.runningSide}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}

            {/* 3. Closing Balance Row */}
            <tr className="bg-slate-50/80 font-bold border-t border-slate-200 text-slate-800">
              <td colSpan={4} className="py-2.5">
                <span className="text-slate-500 font-normal">Ending Position: </span>
                Closing Balance
              </td>
              <td className="text-right font-mono text-slate-900">{formatINR(periodDebitTotal)}</td>
              <td className="text-right font-mono text-slate-900">{formatINR(periodCreditTotal)}</td>
              <td className="text-right font-mono text-slate-900">
                {formatINR(periodClosingBalance)}{" "}
                <span className="text-[10px] uppercase font-bold text-slate-600">
                  {periodClosingSide}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {hasMore && onLoadMore && (
        <div className="flex items-center justify-center p-3 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="btn btn-sm btn-outline gap-1 text-xs"
          >
            <span>{isLoadingMore ? "Loading More..." : "Load Next Page (Continuous Balance)"}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
