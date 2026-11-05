"use client";

import React, { useState } from "react";
import { StatCard } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { Scale, Users, Truck, Package, AlertCircle, ArrowRightLeft } from "lucide-react";
import type { OpeningBalancesSummary } from "@/server/domain/accounting-opening-balances";
import { reclassifyOpeningEquityAction } from "@/app/actions/opening-balances";

interface OverviewProps {
  summary: OpeningBalancesSummary;
  isOwner: boolean;
  onRefresh: () => void;
}

export function OpeningBalancesOverview({ summary, isOwner, onRefresh }: OverviewProps) {
  const [reclassifyOpen, setReclassifyOpen] = useState(false);
  const [targetAccountId, setTargetAccountId] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBalanced = summary.openingBalanceEquityNetPaise === 0;

  async function handleReclassify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await reclassifyOpeningEquityAction({
      targetAccountId,
      entryDate,
      reason,
    });

    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setReclassifyOpen(false);
      onRefresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Stat Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Customer Receivables (1050)"
          value={formatINR(summary.customerReceivablesTotalPaise)}
          footnote="Total opening debtors subledger"
          icon={Users}
        />
        <StatCard
          label="Supplier Payables (2010)"
          value={formatINR(summary.supplierPayablesTotalPaise)}
          footnote="Total opening creditors subledger"
          icon={Truck}
        />
        <StatCard
          label="Opening Inventory (1080)"
          value={formatINR(summary.inventoryValuationTotalPaise)}
          footnote={`${summary.snapshotsCount} posted store snapshots`}
          icon={Package}
        />
        <StatCard
          label="Opening Balance Equity (3999)"
          value={formatINR(Math.abs(summary.openingBalanceEquityNetPaise))}
          footnote={summary.openingBalanceEquityNetPaise >= 0 ? "Credit balance (Assets > Liab)" : "Debit balance (Liab > Assets)"}
          icon={Scale}
          tone={isBalanced ? "brand" : "warning"}
        />
      </div>

      {/* 2. Equity Reconciliation Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-lg ${isBalanced ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
              {isBalanced ? <Scale className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Opening Equity Reconciliation (Account 3999)</h3>
              <p className="text-sm text-slate-400 mt-0.5">
                {isBalanced
                  ? "Opening balances are fully reconciled. No unallocated equity difference remains in Account 3999."
                  : `Unallocated equity difference: ${formatINR(Math.abs(summary.openingBalanceEquityNetPaise))} ${summary.openingBalanceEquityNetPaise >= 0 ? "Cr" : "Dr"}. Individual parties can be entered progressively.`}
              </p>
            </div>
          </div>
          {isOwner && !isBalanced && (
            <button
              onClick={() => setReclassifyOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <ArrowRightLeft className="w-4 h-4 text-emerald-400" />
              Reclassify Equity
            </button>
          )}
        </div>
      </div>

      {/* 3. Reclassify Modal */}
      {reclassifyOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">Reclassify Opening Balance Equity</h3>
            <p className="text-sm text-slate-400 mt-1">
              Reclassify unallocated balance of {formatINR(Math.abs(summary.openingBalanceEquityNetPaise))} from Account 3999 into Owner&apos;s Capital or Retained Earnings.
            </p>

            {error && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-sm text-rose-400">
                {error}
              </div>
            )}

            <form onSubmit={handleReclassify} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300">Target Account ID (Capital/Equity)</label>
                <input
                  type="text"
                  required
                  placeholder="UUID of target account"
                  value={targetAccountId}
                  onChange={(e) => setTargetAccountId(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Effective Date</label>
                <input
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300">Audit Justification / Reason</label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. FY 2026-27 opening equity transfer to Owner Capital"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReclassifyOpen(false)}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
                >
                  {loading ? "Reclassifying..." : "Confirm Reclassification"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
