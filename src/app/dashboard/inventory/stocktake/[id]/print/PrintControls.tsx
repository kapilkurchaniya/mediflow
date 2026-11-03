"use client";

import React from "react";
import Link from "next/link";
import { Printer, ArrowLeft, EyeOff, ShieldCheck } from "lucide-react";

interface PrintControlsProps {
  sessionId: string;
  currentMode: "blind" | "manager";
}

export function PrintControls({ sessionId, currentMode }: PrintControlsProps) {
  return (
    <div className="print:hidden mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-ink-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/inventory/stocktake/${sessionId}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600 hover:text-ink-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Session
        </Link>
        <span className="text-ink-300">|</span>
        <div className="flex items-center rounded-lg bg-ink-100 p-0.5 text-xs font-medium">
          <Link
            href={`/dashboard/inventory/stocktake/${sessionId}/print?mode=blind`}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
              currentMode === "blind"
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <EyeOff className="h-3.5 w-3.5 text-amber-600" />
            Blind Count Sheet
          </Link>
          <Link
            href={`/dashboard/inventory/stocktake/${sessionId}/print?mode=manager`}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
              currentMode === "manager"
                ? "bg-white text-ink-900 shadow-sm"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
            Manager Review Sheet
          </Link>
        </div>
      </div>

      <button
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
      >
        <Printer className="h-4 w-4" />
        Print Sheet
      </button>
    </div>
  );
}
