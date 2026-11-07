"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Boxes, RotateCcw, LayoutDashboard } from "lucide-react";

export default function InventoryErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Inventory Module Error Boundary caught error:", error);
  }, [error]);

  return (
    <div className="min-h-[55vh] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-ink-100 shadow-lg p-6 space-y-5 animate-enter">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-50 text-brand-600 rounded-xl">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-ink-900">Inventory View Interrupted</h2>
            <p className="text-xs text-ink-500">Error loading stock, batches, or item catalog.</p>
          </div>
        </div>

        <p className="text-xs text-ink-600 bg-ink-50 p-3 rounded-xl border border-ink-100">
          We could not complete your inventory request. Physical stock ledgers and batch allocations remain intact.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium text-xs rounded-xl shadow-sm transition active:scale-[0.98]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reload Stock View
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-ink-100 hover:bg-ink-200 text-ink-700 font-medium text-xs rounded-xl transition"
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            Overview
          </Link>
        </div>

        <details className="text-[11px] text-ink-400 pt-2 border-t border-ink-100">
          <summary className="cursor-pointer hover:text-ink-600 font-medium select-none">
            Error Details {error.digest && `(#${error.digest.slice(0, 8)})`}
          </summary>
          <p className="mt-1 font-mono text-[10px] text-ink-600 break-all">
            {error.message || "Unknown error"}
          </p>
        </details>
      </div>
    </div>
  );
}
