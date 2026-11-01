"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2, ArrowRight, Boxes, FileCheck } from "lucide-react";
import { ImportEntity } from "@/server/domain/import/types";
import { commitImportJobAction } from "@/app/actions/import";

interface CommitProgressStepProps {
  jobId: string;
  entity: ImportEntity;
  storeId?: string;
  skipErrors: boolean;
  onReset: () => void;
}

export function CommitProgressStep({
  jobId,
  entity,
  storeId,
  skipErrors,
  onReset,
}: CommitProgressStepProps) {
  const [isCommitting, setIsCommitting] = useState(true);
  const [resultTotals, setResultTotals] = useState<{
    rows: number;
    valid: number;
    errors: number;
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;
    async function executeCommit() {
      setIsCommitting(true);
      setErrorMessage("");
      try {
        const res = await commitImportJobAction({
          jobId,
          storeId,
          skipErrors,
        });

        if (isMounted) {
          if (res.success && res.totals) {
            setResultTotals(res.totals);
          } else {
            setErrorMessage("Failed to commit import job.");
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          console.error("Commit error:", err);
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (isMounted) setIsCommitting(false);
      }
    }

    executeCommit();
    return () => {
      isMounted = false;
    };
  }, [jobId, storeId, skipErrors]);

  if (isCommitting) {
    return (
      <div className="py-20 text-center space-y-5 animate-in fade-in duration-300">
        <div className="relative mx-auto h-16 w-16">
          <Loader2 className="h-16 w-16 animate-spin text-brand-600" />
          <Boxes className="h-6 w-6 text-brand-600 absolute inset-0 m-auto" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-ink-900">Committing Records to Production...</h3>
          <p className="text-xs text-ink-500 max-w-sm mx-auto">
            Writing records in isolated 500-row transactions, matching catalog items, and recording immutable inventory
            movements.
          </p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="py-12 space-y-6 text-center animate-in fade-in">
        <div className="h-14 w-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-ink-900">Commit Failed</h3>
          <p className="text-sm text-red-700 max-w-md mx-auto">{errorMessage}</p>
        </div>
        <div className="pt-4 flex justify-center gap-3">
          <button type="button" onClick={onReset} className="btn btn-secondary px-5 py-2.5 rounded-xl font-medium">
            Try Again
          </button>
          <Link href={`/dashboard/import/${jobId}`} className="btn btn-primary px-5 py-2.5 rounded-xl font-medium">
            View Job Log
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="text-center space-y-2">
        <div className="h-16 w-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h2 className="text-2xl font-bold text-ink-900 tracking-tight">Import Completed Successfully!</h2>
        <p className="text-sm text-ink-500 max-w-md mx-auto">
          Your legacy {entity} data has been migrated into MediFlow with verified transactional consistency.
        </p>
      </div>

      {/* Metrics Card */}
      {resultTotals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-2xl mx-auto">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
            <div className="text-xs font-semibold text-ink-500 uppercase">Processed</div>
            <div className="text-2xl font-bold text-ink-900 mt-1">{resultTotals.rows.toLocaleString()}</div>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-center">
            <div className="text-xs font-semibold text-emerald-800 uppercase">New Records</div>
            <div className="text-2xl font-bold text-emerald-900 mt-1">{resultTotals.created.toLocaleString()}</div>
          </div>
          <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 text-center">
            <div className="text-xs font-semibold text-blue-800 uppercase">Updated</div>
            <div className="text-2xl font-bold text-blue-900 mt-1">{resultTotals.updated.toLocaleString()}</div>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
            <div className="text-xs font-semibold text-ink-500 uppercase">Skipped</div>
            <div className="text-2xl font-bold text-ink-700 mt-1">{resultTotals.skipped.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* Action CTA Buttons */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-slate-100">
        <button
          type="button"
          onClick={onReset}
          className="btn btn-secondary px-5 py-2.5 rounded-xl font-medium w-full sm:w-auto"
        >
          Import Another File
        </button>

        <Link
          href={`/dashboard/import/${jobId}`}
          className="btn btn-secondary px-5 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          <FileCheck className="h-4 w-4" /> View Detailed Job Report
        </Link>

        <Link
          href={entity === "customers" ? "/dashboard/customers" : entity === "suppliers" ? "/dashboard/suppliers" : "/dashboard/inventory"}
          className="btn btn-primary px-6 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto"
        >
          Go to {entity === "customers" ? "Customers" : entity === "suppliers" ? "Suppliers" : "Inventory"} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

