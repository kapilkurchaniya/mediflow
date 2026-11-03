"use client";

import React from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";

interface PosStatusChipProps {
  isOffline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  onOpenDrawer: () => void;
}

function formatRelativeSync(lastSyncAt: string | null): string {
  if (!lastSyncAt) return "just now";
  const diffMs = Date.now() - new Date(lastSyncAt).getTime();
  if (isNaN(diffMs) || diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins === 0) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

export function PosStatusChip({
  isOffline,
  isSyncing,
  pendingCount,
  lastSyncAt,
  onOpenDrawer,
}: PosStatusChipProps) {
  if (isSyncing) {
    return (
      <button
        type="button"
        onClick={onOpenDrawer}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-800 border border-brand-300 hover:bg-brand-100 transition-colors shadow-2xs"
        title="Syncing pending sales with central server. Click to view pending bills."
        aria-label="Syncing pending bills"
      >
        <RefreshCw className="w-3.5 h-3.5 text-brand-600 animate-spin" />
        <span className="font-medium">Syncing...</span>
        {pendingCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.2 bg-brand-600 text-white rounded-full text-[10px] font-mono font-bold">
            {pendingCount}
          </span>
        )}
      </button>
    );
  }

  if (isOffline) {
    return (
      <button
        type="button"
        onClick={onOpenDrawer}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 transition-colors shadow-2xs"
        title="Counter is operating offline. Click to view pending bills."
        aria-label={`Offline mode active, ${pendingCount} bills pending`}
      >
        <WifiOff className="w-3.5 h-3.5 text-amber-600" />
        <span className="font-medium">
          Offline {pendingCount > 0 ? `· ${pendingCount} pending` : ""}
        </span>
        {pendingCount > 0 && (
          <span className="ml-0.5 px-1.5 py-0.2 bg-amber-600 text-white rounded-full text-[10px] font-mono font-bold">
            {pendingCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenDrawer}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100 transition-colors shadow-2xs"
      title={`Counter is online. Last synced ${formatRelativeSync(lastSyncAt)}. Click to view pending bills.`}
      aria-label={`Online, last synced ${formatRelativeSync(lastSyncAt)}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
      </span>
      <Wifi className="w-3.5 h-3.5 text-emerald-600" />
      <span className="font-medium">
        Online · synced {formatRelativeSync(lastSyncAt)}
      </span>
      {pendingCount > 0 && (
        <span className="ml-0.5 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-mono font-bold">
          {pendingCount}
        </span>
      )}
    </button>
  );
}
