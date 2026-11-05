"use client";

import React, { useState } from "react";
import { formatINR } from "@/lib/format";
import { CheckCircle2, Clock, PlusCircle } from "lucide-react";
import type { PartyOpeningRow } from "@/server/domain/accounting-opening-balances";
import { postSupplierOpeningBalanceAction } from "@/app/actions/opening-balances";

interface SupplierTableProps {
  rows: PartyOpeningRow[];
  onRefresh: () => void;
}

export function SupplierOpeningBalancesTable({ rows, onRefresh }: SupplierTableProps) {
  const [selectedSupp, setSelectedSupp] = useState<PartyOpeningRow | null>(null);
  const [amountRupees, setAmountRupees] = useState("");
  const [asOfDate, setAsOfDate] = useState("2026-04-01");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openModal(supp: PartyOpeningRow) {
    setSelectedSupp(supp);
    setAmountRupees(supp.openingBalancePaise ? (supp.openingBalancePaise / 100).toString() : "0");
    setError(null);
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSupp) return;
    setLoading(true);
    setError(null);

    const amountPaise = Math.round(parseFloat(amountRupees || "0") * 100);
    const res = await postSupplierOpeningBalanceAction({
      supplierId: selectedSupp.id,
      amountPaise,
      asOfDate,
    });

    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSelectedSupp(null);
      onRefresh();
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h3 className="text-base font-semibold text-white">Supplier Opening Payables (Account 2010)</h3>
          <p className="text-xs text-slate-400 mt-0.5">Supplier subledger opening balances and double-entry posting status</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="px-4 py-3">Supplier</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3 text-right">Opening Balance</th>
              <th className="px-4 py-3 text-center">Status</th>
              <th className="px-4 py-3">Cutover Date</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No suppliers found. Import supplier balances or add suppliers.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-4 py-3 font-medium text-white">{row.name}</td>
                  <td className="px-4 py-3 text-slate-400">{row.phone || "—"}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-white">
                    {formatINR(row.openingBalancePaise)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {row.isPosted ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Posted
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Clock className="w-3.5 h-3.5" /> Staging
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{row.asOfDate || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openModal(row)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      {row.isPosted ? "Update" : "Post to GL"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedSupp && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-white">Post Supplier Opening Balance</h3>
            <p className="text-xs text-slate-400 mt-1">
              Supplier: <span className="text-white font-medium">{selectedSupp.name}</span>
            </p>

            {error && (
              <div className="mt-3 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-400">
                {error}
              </div>
            )}

            <form onSubmit={handlePost} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300">Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={amountRupees}
                  onChange={(e) => setAmountRupees(e.target.value)}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">Positive = We owe supplier (Debit 3999 / Credit 2010)</p>
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

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedSupp(null)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg disabled:opacity-50"
                >
                  {loading ? "Posting..." : "Confirm & Post"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
