"use client";

import React, { useRef } from "react";
import { Warehouse, ChevronsUpDown, Store } from "lucide-react";
import clsx from "clsx";
import { useShell } from "./ShellContext";
import { StoreSwitcherDialog } from "./StoreSwitcherDialog";

export function StoreSwitcher() {
  const {
    currentStore,
    allowedStores,
    storeSwitcherOpen,
    setStoreSwitcherOpen,
  } = useShell();

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative" ref={containerRef}>
      {/* Topbar Trigger Button */}
      <button
        type="button"
        onClick={() => setStoreSwitcherOpen(!storeSwitcherOpen)}
        className={clsx(
          "flex h-8 items-center gap-2 rounded-md border border-ink-200/80 bg-white/80 px-2.5 py-1 text-left text-xs font-medium text-ink-800 shadow-2xs backdrop-blur-sm transition-all hover:border-ink-300 hover:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20",
          storeSwitcherOpen && "border-brand-500 ring-2 ring-brand-500/20",
        )}
        title="Switch Branch or Warehouse (Ctrl+Shift+S)"
        aria-label="Switch Store or Warehouse"
        aria-expanded={storeSwitcherOpen}
        aria-haspopup="dialog"
      >
        <span className="grid h-4.5 w-4.5 place-items-center rounded bg-ink-900 text-[10px] font-bold text-white uppercase">
          {currentStore ? currentStore.code.slice(0, 2) : "BR"}
        </span>

        <span className="max-w-[130px] sm:max-w-[170px] truncate font-semibold">
          {currentStore ? currentStore.name : "Select Store"}
        </span>

        {currentStore?.kind === "warehouse" ? (
          <span className="hidden sm:inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
            <Warehouse className="h-3 w-3" /> Warehouse
          </span>
        ) : (
          <span className="hidden sm:inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-semibold text-teal-700 border border-teal-200">
            <Store className="h-3 w-3" /> Retail
          </span>
        )}

        <ChevronsUpDown className="h-3.5 w-3.5 text-ink-400 shrink-0 ml-0.5" />
      </button>

      {/* Dialog Dropdown */}
      {storeSwitcherOpen && (
        <StoreSwitcherDialog
          currentStore={currentStore}
          allowedStores={allowedStores}
          onClose={() => setStoreSwitcherOpen(false)}
        />
      )}
    </div>
  );
}
