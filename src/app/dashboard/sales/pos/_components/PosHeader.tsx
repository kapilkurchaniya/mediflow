"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Volume2,
  VolumeX,
  BookmarkCheck,
  Layers,
  RotateCcw,
  Lock,
  Unlock,
  AlertTriangle,
  Building2,
  Warehouse,
} from "lucide-react";
import { PosStatusChip } from "./PosStatusChip";

interface PosHeaderProps {
  currentStore: {
    id: string;
    name: string;
    code: string;
    kind: "retail" | "warehouse";
  } | null;
  onOpenStoreSwitcher: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  cartLength: number;
  onHoldBill: () => void;
  heldCount: number;
  onOpenHeldBills: () => void;
  onResetSale: () => void;
  activeShift: unknown | null;
  requireShift: boolean;
  isOffline?: boolean;
  isSyncing?: boolean;
  pendingCount?: number;
  lastSyncAt?: string | null;
  onOpenPendingDrawer?: () => void;
}

export function PosHeader({
  currentStore,
  onOpenStoreSwitcher,
  soundEnabled,
  onToggleSound,
  cartLength,
  onHoldBill,
  heldCount,
  onOpenHeldBills,
  onResetSale,
  activeShift,
  requireShift,
  isOffline = false,
  isSyncing = false,
  pendingCount = 0,
  lastSyncAt = null,
  onOpenPendingDrawer,
}: PosHeaderProps) {
  const isWarehouse = currentStore?.kind === "warehouse";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/sales"
            className="btn btn-secondary btn-icon"
            title="Back to Sales"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-ink-900 flex items-center gap-2">
              POS Billing Counter
              <span className="badge badge-brand !text-[11px] font-mono">
                F2 New Bill
              </span>
            </h1>

            {/* Prominent Active Branch Indicator */}
            {currentStore && (
              <button
                type="button"
                onClick={onOpenStoreSwitcher}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-900 border border-brand-200 hover:bg-brand-100 hover:border-brand-300 transition-colors shadow-2xs"
                title="Active Branch - Click to switch (Ctrl+Shift+S)"
              >
                {isWarehouse ? (
                  <Warehouse className="w-3.5 h-3.5 text-amber-600" />
                ) : (
                  <Building2 className="w-3.5 h-3.5 text-brand-600" />
                )}
                <span className="font-medium">{currentStore.name}</span>
                <span className="font-mono text-[10px] text-brand-600 font-bold">
                  [{currentStore.code}]
                </span>
              </button>
            )}

            {/* Offline / Online Sync Status Chip */}
            {onOpenPendingDrawer && (
              <PosStatusChip
                isOffline={isOffline}
                isSyncing={isSyncing}
                pendingCount={pendingCount}
                lastSyncAt={lastSyncAt}
                onOpenDrawer={onOpenPendingDrawer}
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSound}
            className="btn btn-secondary btn-icon"
            title={soundEnabled ? "Audio On — Click to mute scan chime" : "Audio Muted — Click to enable scan chime"}
            aria-label={soundEnabled ? "Mute scan chime" : "Enable scan chime"}
          >
            {soundEnabled ? (
              <Volume2 className="h-4 w-4 text-brand-600" />
            ) : (
              <VolumeX className="h-4 w-4 text-ink-400" />
            )}
          </button>

          <button
            type="button"
            onClick={onHoldBill}
            disabled={cartLength === 0 || isWarehouse}
            className="btn btn-secondary text-xs"
            title="Park current bill (F6)"
          >
            <BookmarkCheck className="h-3.5 w-3.5 mr-1 text-amber-600" /> Hold (F6)
          </button>

          <button
            type="button"
            onClick={onOpenHeldBills}
            className="btn btn-secondary text-xs relative"
            title="View parked bills (F7)"
          >
            <Layers className="h-3.5 w-3.5 mr-1 text-brand-600" /> Parked ({heldCount}) [F7]
          </button>

          <button
            type="button"
            onClick={onResetSale}
            className="btn btn-secondary text-xs"
            title="New bill (F2)"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear (F2)
          </button>

          <Link
            href="/dashboard/sales/register"
            className={`btn btn-secondary text-xs flex items-center gap-1.5 ${
              activeShift
                ? "text-emerald-700 bg-emerald-50"
                : requireShift
                ? "text-amber-800 bg-amber-50 font-bold"
                : "text-ink-600"
            }`}
          >
            {activeShift ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Register Open
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5 text-amber-600" /> Register Closed
              </>
            )}
          </Link>
        </div>
      </div>

      {/* Warehouse Capability Banner */}
      {isWarehouse && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-center justify-between text-amber-900 text-xs shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Warehouse Mode Active:</strong> Retail counter billing is not permitted in central warehouse locations. Switch to a retail branch to bill walk-in customers.
            </span>
          </div>
          <button
            type="button"
            onClick={onOpenStoreSwitcher}
            className="btn btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs py-1 px-3 flex items-center gap-1.5 font-bold shrink-0"
          >
            Switch Branch (Ctrl+Shift+S)
          </button>
        </div>
      )}

      {/* Shift Requirement Banner */}
      {!isWarehouse && requireShift && !activeShift && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between text-amber-900 text-xs shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Open register to start billing:</strong> A cash register shift is required for this store.
            </span>
          </div>
          <Link
            href="/dashboard/sales/register"
            className="btn btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs py-1 px-3 flex items-center gap-1.5 font-bold"
          >
            <Unlock className="w-3.5 h-3.5" /> Open Register (F4)
          </Link>
        </div>
      )}
    </div>
  );
}
