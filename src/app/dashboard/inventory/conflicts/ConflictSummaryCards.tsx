"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, PackageX, RefreshCw } from "lucide-react";

export interface ConflictItem {
  id: string;
  status: string;
  outstandingQty: number;
  qtyOnHand: number;
}

interface ConflictSummaryCardsProps {
  conflicts: ConflictItem[];
}

export function ConflictSummaryCards({ conflicts }: ConflictSummaryCardsProps) {
  const activeConflicts = conflicts.filter((c) =>
    ["open", "investigating", "partially_resolved"].includes(c.status),
  );
  const totalDeficit = activeConflicts.reduce((acc, c) => acc + c.outstandingQty, 0);
  const criticalBatches = activeConflicts.filter((c) => c.qtyOnHand < 0).length;
  const resolvedCount = conflicts.filter((c) => c.status === "resolved").length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Active Discrepancies */}
      <div className="card p-4 bg-white border border-ink-150 shadow-2xs rounded-xl flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-ink-500">
            Unresolved Conflicts
          </p>
          <p className="text-2xl font-bold text-ink-900 mt-1">
            {activeConflicts.length}
          </p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5" />
        </div>
      </div>

      {/* Deficit Units */}
      <div className="card p-4 bg-white border border-ink-150 shadow-2xs rounded-xl flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-ink-500">
            Outstanding Deficit
          </p>
          <p className="text-2xl font-bold text-rose-600 mt-1">
            {totalDeficit} <span className="text-sm font-normal text-ink-500">units</span>
          </p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
          <PackageX className="w-5 h-5" />
        </div>
      </div>

      {/* Critical Negative Batches */}
      <div className="card p-4 bg-white border border-ink-150 shadow-2xs rounded-xl flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-ink-500">
            Negative Batches
          </p>
          <p className="text-2xl font-bold text-ink-900 mt-1">
            {criticalBatches}
          </p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <RefreshCw className="w-5 h-5" />
        </div>
      </div>

      {/* Resolved */}
      <div className="card p-4 bg-white border border-ink-150 shadow-2xs rounded-xl flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-ink-500">
            Resolved Cases
          </p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">
            {resolvedCount}
          </p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
