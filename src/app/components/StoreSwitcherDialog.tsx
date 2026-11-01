"use client";

import React, { useState, useRef, useEffect, useTransition, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Building2,
  Warehouse,
  Check,
  Search,
  Loader2,
  Store,
  AlertCircle,
  X,
} from "lucide-react";
import clsx from "clsx";
import type { AllowedStoreItem } from "@/server/domain/stores";
import { switchStoreAction } from "@/app/actions/session";

interface StoreSwitcherDialogProps {
  currentStore: AllowedStoreItem | null;
  allowedStores: AllowedStoreItem[];
  onClose: () => void;
}

export function StoreSwitcherDialog({
  currentStore,
  allowedStores,
  onClose,
}: StoreSwitcherDialogProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState("");
  const initialIdx = useMemo(() => {
    const idx = allowedStores.findIndex((s) => s.id === currentStore?.id);
    return idx >= 0 ? idx : 0;
  }, [allowedStores, currentStore]);

  const [selectedIndex, setSelectedIndex] = useState(initialIdx);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [switchingStoreId, setSwitchingStoreId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  const filteredStores = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allowedStores;
    return allowedStores.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.gstin && s.gstin.toLowerCase().includes(q)),
    );
  }, [allowedStores, query]);

  const handleSelect = (targetStoreId: string) => {
    if (isPending || switchingStoreId) return;
    if (targetStoreId === currentStore?.id) {
      onClose();
      return;
    }

    setSwitchingStoreId(targetStoreId);
    setErrorMessage("");

    startTransition(async () => {
      if (pathname === "/dashboard/sales/pos") {
        window.dispatchEvent(
          new CustomEvent("mediflow:store-switch", {
            detail: { targetStoreId },
          }),
        );
      }

      const res = await switchStoreAction(targetStoreId);
      if (!res.success) {
        setErrorMessage(res.error || "Failed to switch store");
        setSwitchingStoreId(null);
        return;
      }

      setSwitchingStoreId(null);
      onClose();
      router.refresh();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredStores.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(
        (prev) => (prev - 1 + filteredStores.length) % Math.max(1, filteredStores.length),
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filteredStores[selectedIndex];
      if (target) handleSelect(target.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-ink-950/20 backdrop-blur-2xs animate-fade"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Switch branch or warehouse"
        className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 z-50 w-[320px] sm:w-[360px] rounded-xl border border-ink-200 bg-white p-2.5 shadow-xl animate-enter focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-ink-100">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-900">
            <Building2 className="h-4 w-4 text-brand-600" />
            <span>Switch Branch / Warehouse</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="kbd text-[10px]">Ctrl+Shift+S</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-0.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100"
              aria-label="Close switcher"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="mb-2 flex items-center gap-1.5 rounded-md bg-red-50 p-2 text-xs text-red-700 border border-red-200">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}

        {/* Search Input */}
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-ink-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search stores or warehouses..."
            className="w-full rounded-lg border border-ink-200 bg-ink-50/50 pl-8 pr-3 py-1.5 text-xs text-ink-900 placeholder-ink-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        {/* Stores List */}
        <div className="max-h-64 overflow-y-auto space-y-1 pr-0.5" role="listbox">
          {filteredStores.length === 0 ? (
            <div className="py-6 text-center text-xs text-ink-500">
              No stores found matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            filteredStores.map((store, idx) => {
              const isActiveStore = store.id === currentStore?.id;
              const isHighlighted = idx === selectedIndex;
              const isSwitching = switchingStoreId === store.id;

              return (
                <button
                  key={store.id}
                  type="button"
                  role="option"
                  aria-selected={isActiveStore}
                  onClick={() => handleSelect(store.id)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  disabled={isPending}
                  className={clsx(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                    isHighlighted ? "bg-brand-50/70 text-ink-900" : "hover:bg-ink-50 text-ink-800",
                    isActiveStore && "font-semibold bg-ink-50/50",
                  )}
                >
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink-100 text-[11px] font-bold text-ink-700">
                    {store.kind === "warehouse" ? (
                      <Warehouse className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <Store className="h-3.5 w-3.5 text-brand-600" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-ink-900">
                        {store.name}
                      </span>
                      <span className="font-mono text-[10px] text-ink-500">
                        [{store.code}]
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-ink-500">
                      <span className="capitalize">{store.kind}</span>
                      {store.stateCode && <span>• State: {store.stateCode}</span>}
                    </div>
                  </div>

                  {isSwitching ? (
                    <Loader2 className="h-4 w-4 animate-spin text-brand-600 shrink-0" />
                  ) : isActiveStore ? (
                    <Check className="h-4 w-4 text-brand-600 shrink-0" />
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="mt-2 pt-2 border-t border-ink-100 flex items-center justify-between text-[11px] text-ink-500">
          <span>{allowedStores.length} store{allowedStores.length === 1 ? "" : "s"} available</span>
          <span>Use ↑↓ Enter to switch</span>
        </div>
      </div>
    </>
  );
}
