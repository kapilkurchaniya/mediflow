"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Check,
  Download,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { ImportEntity, ImportRowStatus, ImportRowErrorDetail } from "@/server/domain/import/types";
import { ImportJobRow } from "@/server/db/schema/import";
import {
  validateImportJobAction,
  getImportJobRowsAction,
  exportImportErrorsCsvAction,
} from "@/app/actions/import";

interface ReviewStepProps {
  jobId: string;
  entity: ImportEntity;
  onProceedToCommit: (skipErrors: boolean) => void;
  onBack: () => void;
}

export function ReviewStep({ jobId, onProceedToCommit, onBack }: ReviewStepProps) {
  const [isValidating, setIsValidating] = useState(true);
  const [validCount, setValidCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);
  const [totalRows, setTotalRows] = useState(0);

  const [activeTab, setActiveTab] = useState<"all" | "error" | "valid">("all");
  const [rows, setRows] = useState<ImportJobRow[]>([]);
  const [isLoadingRows, setIsLoadingRows] = useState(false);
  const [skipErrors, setSkipErrors] = useState(true);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // Validate upon entry
  useEffect(() => {
    let isMounted = true;
    async function runValidation() {
      setIsValidating(true);
      try {
        const res = await validateImportJobAction({ jobId });
        if (res.success && isMounted) {
          setValidCount(res.validCount);
          setErrorCount(res.errorCount);
          setTotalRows(res.validCount + res.errorCount);
          if (res.errorCount > 0) setActiveTab("error");
          else setActiveTab("valid");
        }
      } catch (err) {
        console.error("Validation failed:", err);
      } finally {
        if (isMounted) setIsValidating(false);
      }
    }
    runValidation();
    return () => {
      isMounted = false;
    };
  }, [jobId]);

  // Load staged rows for review
  useEffect(() => {
    let isMounted = true;
    async function loadRows() {
      setIsLoadingRows(true);
      try {
        const filterStatus: ImportRowStatus | undefined =
          activeTab === "all" ? undefined : activeTab === "error" ? "error" : "valid";
        const res = await getImportJobRowsAction({
          jobId,
          status: filterStatus,
          limit: 30,
        });
        if (isMounted) {
          setRows(res.rows);
        }
      } catch (err) {
        console.error("Error fetching rows:", err);
      } finally {
        if (isMounted) setIsLoadingRows(false);
      }
    }

    if (!isValidating) {
      loadRows();
    }
    return () => {
      isMounted = false;
    };
  }, [jobId, activeTab, isValidating]);

  const handleDownloadErrorCsv = async () => {
    setIsExportingCsv(true);
    try {
      const res = await exportImportErrorsCsvAction(jobId);
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
      console.error("Failed to export errors:", err);
    } finally {
      setIsExportingCsv(false);
    }
  };

  if (isValidating) {
    return (
      <div className="py-20 text-center space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-brand-600 mx-auto" />
        <h3 className="text-base font-semibold text-ink-900">Validating & Normalizing Staged Rows...</h3>
        <p className="text-xs text-ink-500 max-w-sm mx-auto">
          Parsing dates, verifying GSTIN checksums, converting currency to paise, and checking catalog matches.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div>
        <h2 className="text-xl font-bold text-ink-900 tracking-tight">Validation Results</h2>
        <p className="text-sm text-ink-500 mt-1">
          Review validated records and address formatting errors before committing to the database.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200 bg-white">
          <div className="text-xs font-semibold text-ink-500 uppercase tracking-wider">Total Rows Staged</div>
          <div className="text-2xl font-bold text-ink-900 mt-2">{totalRows.toLocaleString()}</div>
          <div className="text-xs text-ink-400 mt-1">Processed from uploaded file</div>
        </div>

        <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Ready to Commit</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-2">{validCount.toLocaleString()}</div>
          <div className="text-xs text-emerald-700 mt-1">Normalized without errors</div>
        </div>

        <div
          className={`p-5 rounded-2xl border ${
            errorCount > 0 ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-slate-50/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${errorCount > 0 ? "text-red-800" : "text-ink-500"}`}>
              Rows with Errors
            </span>
            {errorCount > 0 ? (
              <AlertCircle className="h-4 w-4 text-red-600" />
            ) : (
              <Check className="h-4 w-4 text-slate-400" />
            )}
          </div>
          <div className={`text-2xl font-bold mt-2 ${errorCount > 0 ? "text-red-900" : "text-ink-900"}`}>
            {errorCount.toLocaleString()}
          </div>
          <div className={`text-xs mt-1 ${errorCount > 0 ? "text-red-700" : "text-ink-400"}`}>
            {errorCount > 0 ? "Can be skipped or fixed" : "Zero errors found"}
          </div>
        </div>
      </div>

      {/* Skip Errors Banner */}
      {errorCount > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <span className="font-semibold">{errorCount} rows have formatting issues.</span> You can skip them and
              commit the {validCount} valid rows immediately, or export the error rows to fix in Excel.
            </div>
          </div>
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <button
              type="button"
              disabled={isExportingCsv}
              onClick={handleDownloadErrorCsv}
              className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              {isExportingCsv ? "Exporting..." : "Download Errors CSV"}
            </button>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-amber-900 select-none">
              <input
                type="checkbox"
                checked={skipErrors}
                onChange={(e) => setSkipErrors(e.target.checked)}
                className="rounded border-amber-400 text-brand-600 focus:ring-brand-500 h-4 w-4"
              />
              Skip invalid rows
            </label>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === "all" ? "border-brand-600 text-brand-600" : "border-transparent text-ink-500 hover:text-ink-900"
            }`}
          >
            All Rows ({totalRows})
          </button>
          {errorCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("error")}
              className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                activeTab === "error"
                  ? "border-red-600 text-red-600"
                  : "border-transparent text-ink-500 hover:text-red-700"
              }`}
            >
              Errors Only ({errorCount})
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab("valid")}
            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all ${
              activeTab === "valid"
                ? "border-emerald-600 text-emerald-600"
                : "border-transparent text-ink-500 hover:text-emerald-700"
            }`}
          >
            Valid Rows ({validCount})
          </button>
        </div>
        <span className="text-xs text-ink-400 pb-2">Showing first 30 preview rows</span>
      </div>

      {/* Staged Rows Table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        {isLoadingRows ? (
          <div className="py-12 text-center text-xs text-ink-500">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-brand-600 mb-2" />
            Loading staged rows...
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-xs text-ink-400">No rows found matching current filter.</div>
        ) : (
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-ink-700 font-semibold border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 w-16">#</th>
                  <th className="px-4 py-2.5 w-24">Status</th>
                  <th className="px-4 py-2.5">Normalized Preview</th>
                  <th className="px-4 py-2.5">Errors / Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const isErr = r.status === "error";
                  const norm = r.normalized || {};

                  return (
                    <tr key={r.id} className={isErr ? "bg-red-50/20" : "hover:bg-slate-50/50"}>
                      <td className="px-4 py-2 text-ink-400 font-mono text-[11px]">{r.rowNo}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isErr ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {isErr ? "Error" : "Valid"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-ink-800">
                        <div className="font-semibold truncate max-w-sm">
                          {String(norm.name || norm.medicineCodeOrName || r.raw["ITEM NAME"] || r.raw["NAME"] || "—")}
                        </div>
                        <div className="text-[11px] text-ink-500 truncate max-w-md">
                          {Object.entries(norm)
                            .slice(1, 4)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-red-700 text-xs">
                        {r.errors && r.errors.length > 0 ? (
                          <ul className="space-y-0.5">
                            {r.errors.map((e: ImportRowErrorDetail, idx: number) => (
                              <li key={idx} className="flex items-center gap-1 font-medium">
                                • {e.field}: {e.message}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-emerald-600 flex items-center gap-1 text-[11px]">
                            <Check className="h-3 w-3" /> Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onBack}
          className="btn btn-secondary px-5 py-2.5 rounded-xl font-medium flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Mapping
        </button>

        <button
          type="button"
          disabled={validCount === 0}
          onClick={() => onProceedToCommit(skipErrors)}
          className="btn btn-primary px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 shadow-sm"
        >
          Commit {skipErrors ? validCount.toLocaleString() : totalRows.toLocaleString()} Rows →
        </button>
      </div>
    </div>
  );
}
