"use client";

import React, { useState } from "react";
import { formatINR } from "@/lib/format";
import { Package, CheckCircle2, ArrowRight } from "lucide-react";
import { captureAndPostInventorySnapshotAction } from "@/app/actions/opening-balances";

interface StoreOption {
  id: string;
  name: string;
}

interface StockCardProps {
  stores: StoreOption[];
  onRefresh: () => void;
}

export function StockOpeningBalanceCard({ stores, onRefresh }: StockCardProps) {
  const [selectedStoreId, setSelectedStoreId] = useState(stores[0]?.id || "");
  const [asOfDate, setAsOfDate] = useState("2026-04-01");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleCaptureAndPost(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStoreId) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const res = await captureAndPostInventorySnapshotAction({
      storeId: selectedStoreId,
      asOfDate,
    });

    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSuccessMsg(
        `Snapshot posted successfully! Valuation: ${formatINR(res.result?.totalValuePaise || 0)} (${res.result?.itemsCount || 0} batches). Journal JV created.`
      );
      onRefresh();
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <Package className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">Opening Inventory Cutover Snapshot (Account 1080)</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Captures immutable opening stock movements (`type: &quot;opening&quot;`) into an official store snapshot and posts Debit Account 1080 / Credit Account 3999.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-400">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      <form onSubmit={handleCaptureAndPost} className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
        <div>
          <label className="block text-xs font-medium text-slate-300">Store Branch</label>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300">Cutover Date</label>
          <input
            type="date"
            required
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading || !selectedStoreId}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50 transition-colors"
          >
            {loading ? "Capturing..." : "Capture & Post Snapshot"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>

      <div className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80 text-xs text-slate-400 space-y-1">
        <div className="font-medium text-slate-300">Accounting Model Notes:</div>
        <div>
          • In retail pharmacy periodic accounting, opening stock is initialized into Balance Sheet Account 1080 at cutover.
        </div>
        <div>
          • Subsequent operational transactions post to Purchases (4010) and Sales (3010). Account 1080 is adjusted during physical stocktakes and expiry write-offs.
        </div>
      </div>
    </div>
  );
}
