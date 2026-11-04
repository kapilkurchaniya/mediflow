"use client";

import { useState, useTransition } from "react";
import { Download, ExternalLink, Eye, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatINR } from "@/lib/format";
import type { DayBookEntryRow, DayBookFilter } from "@/server/domain/accounting-reports";
import { JournalEntryModal, getSourceRoute } from "./JournalEntryModal";
import { exportDayBookCsvAction } from "@/app/actions/accounting-reports";
import { useRouter } from "next/navigation";

interface DayBookTableProps {
  entries: DayBookEntryRow[];
  totalVouchers: number;
  currentPage: number;
  pageSize: number;
  filter: DayBookFilter;
}

export function DayBookTable({
  entries,
  totalVouchers,
  currentPage,
  pageSize,
  filter,
}: DayBookTableProps) {
  const router = useRouter();
  const [selectedEntry, setSelectedEntry] = useState<DayBookEntryRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(totalVouchers / pageSize));

  async function handleExport() {
    try {
      setIsExporting(true);
      const csv = await exportDayBookCsvAction(filter);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute(
        "download",
        `day-book-${filter.dateRange.from ?? "all"}-${filter.dateRange.to ?? "all"}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to export Day Book CSV", err);
    } finally {
      setIsExporting(false);
    }
  }

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams(window.location.search);
    params.set("page", String(newPage));
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  return (
    <div className="space-y-4">
      {/* Table Action Bar */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div>
          Showing {entries.length === 0 ? 0 : (currentPage - 1) * pageSize + 1} to{" "}
          {Math.min(currentPage * pageSize, totalVouchers)} of {totalVouchers} vouchers
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.refresh()}
            className="btn btn-ghost btn-xs gap-1"
            title="Refresh entries"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || entries.length === 0}
            className="btn btn-outline btn-xs gap-1"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? "Exporting..." : "Export CSV"}</span>
          </button>
        </div>
      </div>

      {/* Main Register Table */}
      <div className="card bg-white border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="table table-sm w-full">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 text-xs">
              <tr>
                <th>Date</th>
                <th>Voucher No</th>
                <th>Type</th>
                <th>Particulars / Narration</th>
                <th>Store</th>
                <th className="text-right">Debit (₹)</th>
                <th className="text-right">Credit (₹)</th>
                <th className="text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    No journal entries found for the selected period and store.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => {
                  const sourceUrl = getSourceRoute(entry.refType, entry.refId);
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="whitespace-nowrap text-slate-600 font-mono">{entry.entryDate}</td>
                      <td>
                        <button
                          onClick={() => setSelectedEntry(entry)}
                          className="font-mono font-medium text-primary hover:underline text-left"
                        >
                          {entry.entryNo}
                        </button>
                      </td>
                      <td>
                        <span className="badge badge-sm badge-ghost uppercase tracking-wider text-[10px]">
                          {entry.refType ?? "journal"}
                        </span>
                      </td>
                      <td className="max-w-xs truncate text-slate-700" title={entry.narration}>
                        {entry.narration || "—"}
                      </td>
                      <td className="text-slate-500 whitespace-nowrap">
                        {entry.storeName ?? "Unallocated"}
                      </td>
                      <td className="text-right font-mono font-medium text-slate-900">
                        {formatINR(entry.totalDebit)}
                      </td>
                      <td className="text-right font-mono font-medium text-slate-900">
                        {formatINR(entry.totalCredit)}
                      </td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => setSelectedEntry(entry)}
                            className="btn btn-ghost btn-xs btn-square text-slate-500 hover:text-slate-800"
                            title="Inspect Journal Lines"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {sourceUrl ? (
                            <Link
                              href={sourceUrl}
                              className="btn btn-ghost btn-xs btn-square text-slate-500 hover:text-primary"
                              title="Open Source Record"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                          ) : (
                            <span className="w-6" />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <div className="text-xs text-slate-500">
              Page {currentPage} of {totalPages}
            </div>
            <div className="join">
              <button
                disabled={currentPage <= 1 || isPending}
                onClick={() => handlePageChange(currentPage - 1)}
                className="join-item btn btn-xs btn-outline"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <button
                disabled={currentPage >= totalPages || isPending}
                onClick={() => handlePageChange(currentPage + 1)}
                className="join-item btn btn-xs btn-outline"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Complete Journal Voucher Modal */}
      {selectedEntry && (
        <JournalEntryModal entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  );
}
