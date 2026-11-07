"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw, ShieldCheck, ArrowLeft } from "lucide-react";

export default function PosErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-ink-100 shadow-xl overflow-hidden animate-enter">
        <div className="bg-amber-500/10 border-b border-amber-200/50 p-6 flex items-start gap-4">
          <div className="p-3 bg-amber-500 text-white rounded-xl shadow-sm shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
              High-Velocity Counter Protection
            </span>
            <h2 className="text-lg font-bold text-ink-900 mt-1">
              Counter Interruption Detected
            </h2>
            <p className="text-xs text-ink-600 mt-0.5">
              An unexpected render issue occurred at this billing terminal.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-900">
              <span className="font-semibold block text-emerald-950">
                Your draft cart is preserved in local storage
              </span>
              All scanned items, quantities, and customer details are safely retained in offline IndexedDB.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-medium text-xs rounded-xl shadow-sm transition active:scale-[0.98]"
            >
              <RotateCcw className="w-4 h-4" />
              Recover Counter Session
            </button>
            <Link
              href="/dashboard/sales/register"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-ink-50 hover:bg-ink-100 text-ink-700 font-medium text-xs rounded-xl transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Sales Register
            </Link>
          </div>

          <details className="text-[11px] text-ink-500 pt-2 border-t border-ink-100">
            <summary className="cursor-pointer hover:text-ink-800 font-medium select-none">
              Diagnostic Reference {error.digest ? `(#${error.digest.slice(0, 10)})` : "(ERR_POS_RECOVERY)"}
            </summary>
            <div className="mt-2 p-2.5 bg-ink-50 rounded-lg text-[11px] text-ink-700 border border-ink-100 leading-relaxed">
              An unexpected terminal interruption was caught safely. Click &quot;Recover Counter Session&quot; to restore your in-flight cart from IndexedDB. If this persists, provide diagnostic reference code{" "}
              <span className="font-mono font-semibold">{error.digest || "ERR_POS_RECOVERY"}</span> to your administrator.
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
