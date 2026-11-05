"use client";

import { Printer } from "lucide-react";

export function PublicPrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink-800 hover:bg-ink-900 text-white text-xs font-medium rounded-lg shadow-sm transition cursor-pointer"
    >
      <Printer className="w-3.5 h-3.5" />
      <span>Print / PDF</span>
    </button>
  );
}

