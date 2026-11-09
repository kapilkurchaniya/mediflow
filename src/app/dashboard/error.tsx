"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw, Home } from "lucide-react";
import { reportBoundaryError } from "@/lib/telemetry";

export default function DashboardRootErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportBoundaryError("dashboard-root", error);
  }, [error]);
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-ink-100 shadow-lg p-6 space-y-5 animate-enter">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-red-100 text-red-600 rounded-xl">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink-900">Dashboard Interrupted</h2>
            <p className="text-xs text-ink-500">An unexpected application error occurred.</p>
          </div>
        </div>

        <p className="text-xs text-ink-600 bg-ink-50 p-3 rounded-xl border border-ink-100">
          We encountered an issue rendering this section. No operational data was modified or lost.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium text-xs rounded-xl shadow-sm transition active:scale-[0.98]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-ink-100 hover:bg-ink-200 text-ink-700 font-medium text-xs rounded-xl transition"
          >
            <Home className="w-3.5 h-3.5" />
            Dashboard
          </Link>
        </div>

        <details className="text-[11px] text-ink-400 pt-2 border-t border-ink-100">
          <summary className="cursor-pointer hover:text-ink-600 font-medium select-none">
            Diagnostic Reference {error.digest ? `(#${error.digest.slice(0, 8)})` : "(ERR_DASHBOARD)"}
          </summary>
          <p className="mt-1 text-[11px] text-ink-600">
            A rendering interruption occurred. Reference code: <span className="font-mono font-semibold">{error.digest || "ERR_DASHBOARD"}</span>.
          </p>
        </details>
      </div>
    </div>
  );
}
