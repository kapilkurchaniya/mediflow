"use client";

import { Truck, CheckCircle2, Clock } from "lucide-react";
import { formatINR } from "@/lib/money";

interface EWayBillMetricsProps {
  total: number;
  activeCount: number;
  expiringCount: number;
  activeValue: number;
}

export function EWayBillMetrics({
  total,
  activeCount,
  expiringCount,
  activeValue,
}: EWayBillMetricsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Consignments */}
      <div className="card rounded-xl border border-ink-150 bg-white p-5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-500">
            Total Consignments
          </span>
          <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
            <Truck className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-ink-900">{total}</div>
        <p className="mt-1 text-xs text-ink-500">All statutory E-Way Bills on record</p>
      </div>

      {/* Active in Transit */}
      <div className="card rounded-xl border border-ink-150 bg-white p-5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-500">
            Active in Transit
          </span>
          <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-emerald-600">{activeCount}</div>
        <p className="mt-1 text-xs text-ink-500">Valid Part-B transit on Indian roads</p>
      </div>

      {/* Expiring < 12 Hours */}
      <div className="card rounded-xl border border-ink-150 bg-white p-5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-500">
            Expiring &lt; 12 Hours
          </span>
          <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
            <Clock className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-amber-600">{expiringCount}</div>
        <p className="mt-1 text-xs text-ink-500">Require transshipment or delivery update</p>
      </div>

      {/* Active Transit Value */}
      <div className="card rounded-xl border border-ink-150 bg-white p-5 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-ink-500">
            Active Transit Value
          </span>
          <div className="rounded-lg bg-violet-50 p-2 text-violet-600">
            <span className="text-sm font-bold">₹</span>
          </div>
        </div>
        <div className="mt-2 text-2xl font-bold text-ink-900">{formatINR(activeValue)}</div>
        <p className="mt-1 text-xs text-ink-500">Aggregate consignment valuation</p>
      </div>
    </div>
  );
}

