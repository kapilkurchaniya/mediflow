"use client";

import React, { useState } from "react";
import { format } from "date-fns";
import {
  FileSpreadsheet,
  CheckCircle2,
  Download,
  Play,
  Check,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { ImportJob, ImportJobRow } from "@/server/db/schema/import";
import { ImportRowStatus, ImportRowErrorDetail } from "@/server/domain/import/types";
import {
  commitImportJobAction,
  exportImportErrorsCsvAction,
  getImportJobRowsAction,
} from "@/app/actions/import";

interface JobInspectorClientProps {
  job: ImportJob;
  initialRows: ImportJobRow[];
  totalRowsCount: number;
}

export function JobInspectorClient({
  job: initialJob,
  initialRows,
  totalRowsCount,
}: JobInspectorClientProps) {
  const [job, setJob] = useState<ImportJob>(initialJob);
  const [rows, setRows] = useState<ImportJobRow[]>(initialRows);
  const [totalRows, setTotalRows] = useState(totalRowsCount);
  const [activeTab, setActiveTab] = useState<"all" | "committed" | "error" | "valid">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingRows, setIsLoadingRows] = useState(false);

  const [isCommitting, setIsCommitting] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [actionMessage, setActionMessage] = useState("");

  const PAGE_SIZE = 25;

  const loadRows = async (page: number, tab: typeof activeTab) => {
    setIsLoadingRows(true);
    try {
      const filterStatus: ImportRowStatus | undefined =
        tab === "all" ? undefined : tab;
      const res = await getImportJobRowsAction({
        jobId: job.id,
        status: filterStatus,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setRows(res.rows as ImportJobRow[]);
      setTotalRows(res.total);
      setCurrentPage(page);
    } catch (err) {
      console.error("Failed to load rows:", err);
    } finally {
      setIsLoadingRows(false);
    }
  };

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    loadRows(1, tab);
  };

  const handleCommitNow = async () => {
    setIsCommitting(true);
    setActionMessage("");
    try {
      const res = await commitImportJobAction({
        jobId: job.id,
        skipErrors: true,
      });

      if (res.success && res.totals) {
        setJob((prev) => ({
          ...prev,
          status: "done",
          totals: res.totals,
          finishedAt: new Date(),
        }));
        setActionMessage(`Successfully committed ${res.totals.created} new records!`);
        loadRows(1, "committed");
      }
    } catch (err: unknown) {
      console.error("Commit error:", err);
      setActionMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsCommitting(false);
    }
  };

  const handleExportErrors = async () => {
    setIsExportingCsv(true);
    try {
      const res = await exportImportErrorsCsvAction(job.id);
      if (res.success && res.csvContent) {
        const blob = new Blob([res.csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", res.fileName || "import-errors.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error("Export errors failed:", err);
    } finally {
      setIsExportingCsv(false);
    }
  };

  const statusBadgeStyles: Record<string, string> = {
    done: "bg-emerald-100 text-emerald-800 border-emerald-200",
    committing: "bg-brand-100 text-brand-800 border-brand-200",
    validated: "bg-blue-100 text-blue-800 border-blue-200",
    mapped: "bg-purple-100 text-purple-800 border-purple-200",
    uploaded: "bg-slate-100 text-slate-700 border-slate-200",
    failed: "bg-red-100 text-red-800 border-red-200",
  };

  const filteredRows = searchQuery.trim()
    ? rows.filter((r) => {
        const q = searchQuery.toLowerCase();
        const norm = (r.normalized as Record<string, unknown>) || {};
        return (
          String(r.rowNo).includes(q) ||
          String(norm.name || norm.medicineCodeOrName || "").toLowerCase().includes(q) ||
          Object.values(r.raw).some((v) => String(v).toLowerCase().includes(q))
        );
      })
    : rows;

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="p-6 rounded-2xl border border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 shrink-0">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-ink-900">{job.fileName}</h2>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  statusBadgeStyles[job.status] || "bg-slate-100"
                }`}
              >
                {job.status === "done" && <CheckCircle2 className="h-3.5 w-3.5" />}
                <span className="capitalize">{job.status === "done" ? "Completed" : job.status}</span>
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 font-medium text-ink-600 uppercase">
                {job.entity}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 font-medium text-ink-600 uppercase">
                Preset: {job.source}
              </span>
            </div>
            <p className="text-xs text-ink-500 mt-1">
              Started {format(new Date(job.createdAt), "dd MMM yyyy, HH:mm")}
              {job.finishedAt && ` · Finished ${format(new Date(job.finishedAt), "HH:mm")}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap self-end md:self-auto">
          {job.totals.errors > 0 && (
            <button
              type="button"
              disabled={isExportingCsv}
              onClick={handleExportErrors}
              className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              {isExportingCsv ? "Exporting..." : "Download Errors CSV"}
            </button>
          )}

          {job.status === "validated" && (
            <button
              type="button"
              disabled={isCommitting}
              onClick={handleCommitNow}
              className="btn btn-primary btn-sm text-xs flex items-center gap-1.5 shadow-xs"
            >
              {isCommitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Committing...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" /> Commit Valid Rows
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {actionMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
          {actionMessage}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-slate-200 bg-white">
          <div className="text-xs font-semibold text-ink-500 uppercase">Total Rows</div>
          <div className="text-xl font-bold text-ink-900 mt-1">{job.totals.rows.toLocaleString()}</div>
        </div>
        <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/40">
          <div className="text-xs font-semibold text-emerald-800 uppercase">New Created</div>
          <div className="text-xl font-bold text-emerald-900 mt-1">{job.totals.created.toLocaleString()}</div>
        </div>
        <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/40">
          <div className="text-xs font-semibold text-blue-800 uppercase">Updated</div>
          <div className="text-xl font-bold text-blue-900 mt-1">{job.totals.updated.toLocaleString()}</div>
        </div>
        <div className="p-4 rounded-2xl border border-red-200 bg-red-50/40">
          <div className="text-xs font-semibold text-red-800 uppercase">Errors</div>
          <div className="text-xl font-bold text-red-900 mt-1">{job.totals.errors.toLocaleString()}</div>
        </div>
      </div>

      {/* Row Viewer */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleTabChange("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-ink-600 hover:bg-slate-200"
              }`}
            >
              All Rows
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("committed")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "committed"
                  ? "bg-emerald-700 text-white"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              Committed
            </button>
            {job.totals.errors > 0 && (
              <button
                type="button"
                onClick={() => handleTabChange("error")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "error" ? "bg-red-700 text-white" : "bg-red-50 text-red-800 hover:bg-red-100"
                }`}
              >
                Errors ({job.totals.errors})
              </button>
            )}
            <button
              type="button"
              onClick={() => handleTabChange("valid")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "valid" ? "bg-blue-700 text-white" : "bg-blue-50 text-blue-800 hover:bg-blue-100"
              }`}
            >
              Valid
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search staged rows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-slate-300 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {isLoadingRows ? (
            <div className="py-12 text-center text-xs text-ink-500">
              <Loader2 className="h-5 w-5 animate-spin mx-auto text-brand-600 mb-2" />
              Loading rows...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-400">No rows found in this view.</div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-ink-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 w-16">Row</th>
                  <th className="px-4 py-2.5 w-24">Status</th>
                  <th className="px-4 py-2.5">Name / Identifier</th>
                  <th className="px-4 py-2.5">Normalized Values</th>
                  <th className="px-4 py-2.5">Target Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((r) => {
                  const norm = (r.normalized as Record<string, unknown>) || {};
                  const isErr = r.status === "error";
                  const isCommitted = r.status === "committed";

                  return (
                    <tr key={r.id} className={isErr ? "bg-red-50/20" : "hover:bg-slate-50/50"}>
                      <td className="px-4 py-2 text-ink-400 font-mono text-[11px]">{r.rowNo}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isCommitted
                              ? "bg-emerald-100 text-emerald-800"
                              : isErr
                              ? "bg-red-100 text-red-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {isCommitted && <Check className="h-3 w-3" />}
                          <span className="capitalize">{r.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2 font-medium text-ink-900 truncate max-w-xs">
                        {String(norm.name || norm.medicineCodeOrName || r.raw["ITEM NAME"] || r.raw["NAME"] || "—")}
                      </td>
                      <td className="px-4 py-2 text-ink-600">
                        {isErr ? (
                          <div className="text-red-700 text-xs">
                            {r.errors.map((e: ImportRowErrorDetail, idx: number) => (
                              <div key={idx}>
                                • {e.field}: {e.message}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[11px] text-ink-500 truncate max-w-md">
                            {Object.entries(norm)
                              .slice(0, 4)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-ink-500 font-mono text-[11px]">
                        {r.targetId ? `ID: ${r.targetId.slice(0, 8)}...` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-ink-600">
          <span>
            Showing page {currentPage} of {Math.max(1, Math.ceil(totalRows / PAGE_SIZE))} ({totalRows} total rows)
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1 || isLoadingRows}
              onClick={() => loadRows(currentPage - 1, activeTab)}
              className="btn btn-secondary btn-sm p-1.5 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={currentPage * PAGE_SIZE >= totalRows || isLoadingRows}
              onClick={() => loadRows(currentPage + 1, activeTab)}
              className="btn btn-secondary btn-sm p-1.5 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
