"use client";

import { useState } from "react";
import { Coins, Plus, Minus, ArrowUpRight, ArrowDownRight, Award, Calendar, Check, AlertCircle } from "lucide-react";
import { adjustCustomerLoyalty } from "@/app/actions/loyalty";
import clsx from "clsx";

interface CustomerData {
  id: string;
  name: string;
  phone: string | null;
  loyaltyPoints: number;
}

interface Transaction {
  id: string;
  type: string;
  points: number;
  balanceAfter: number;
  saleId: string | null;
  note: string | null;
  createdAt: Date;
}

export function CustomerLoyaltyClient({
  customer,
  history,
}: {
  customer: CustomerData;
  history: Transaction[];
}) {
  const [currentPoints, setCurrentPoints] = useState(customer.loyaltyPoints);
  const [txs, setTxs] = useState(history);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustPoints, setAdjustPoints] = useState(50);
  const [adjustNote, setAdjustNote] = useState("Complimentary points / Customer delight");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);

    const res = await adjustCustomerLoyalty(customer.id, adjustPoints, adjustNote);
    if (res.error) {
      setError(res.error);
    } else {
      const newBal = currentPoints + adjustPoints;
      setCurrentPoints(newBal);
      setTxs([
        {
          id: `tx_${Date.now()}`,
          type: "adjust",
          points: adjustPoints,
          balanceAfter: newBal,
          saleId: null,
          note: adjustNote,
          createdAt: new Date(),
        },
        ...txs,
      ]);
      setShowAdjustModal(false);
    }
    setIsPending(false);
  };

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-800 font-semibold uppercase tracking-wider">
              Active Reward Balance
            </span>
            <Coins className="h-5 w-5 text-amber-600" />
          </div>
          <div className="text-3xl font-extrabold text-ink-900 mt-2 font-mono">
            {currentPoints} <span className="text-sm font-normal text-ink-500">Points</span>
          </div>
          <div className="text-xs text-amber-700 mt-1 font-medium">
            Worth ₹{(currentPoints * 1.0).toFixed(2)} on next counter purchase
          </div>
        </div>

        <div className="card p-5">
          <div className="text-xs text-ink-500 font-medium">Total Lifetime Earned</div>
          <div className="text-2xl font-bold text-ink-900 mt-2 font-mono">
            {txs.filter((t) => t.type === "earn").reduce((acc, t) => acc + t.points, 0)} pts
          </div>
          <div className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
            <ArrowUpRight className="h-3.5 w-3.5" /> Accrued from bills
          </div>
        </div>

        <div className="card p-5 flex flex-col justify-between">
          <div>
            <div className="text-xs text-ink-500 font-medium">Quick Actions</div>
            <p className="text-xs text-ink-400 mt-1">Manual point adjustments or promotional goodwill.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAdjustModal(true)}
            className="btn btn-secondary btn-sm mt-3 w-fit"
          >
            <Plus className="h-4 w-4" /> Adjust Points
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-ink-150 bg-ink-50/50 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-ink-900">Points History & Ledger</h3>
          <span className="text-xs text-ink-500">{txs.length} entries</span>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Type</th>
                <th>Details / Note</th>
                <th className="text-right">Points</th>
                <th className="text-right">Balance After</th>
              </tr>
            </thead>
            <tbody>
              {txs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-ink-400">
                    No reward transactions recorded yet.
                  </td>
                </tr>
              ) : (
                txs.map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono text-xs text-ink-600">
                      {new Date(t.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>
                      <span
                        className={clsx(
                          "badge text-[11px] capitalize",
                          t.type === "earn"
                            ? "badge-success"
                            : t.type === "redeem"
                            ? "badge-info"
                            : "badge-neutral"
                        )}
                      >
                        {t.type}
                      </span>
                    </td>
                    <td className="text-xs text-ink-800">{t.note || "Loyalty transaction"}</td>
                    <td
                      className={clsx(
                        "text-right font-mono text-xs font-bold",
                        t.points > 0 ? "text-emerald-600" : "text-rose-600"
                      )}
                    >
                      {t.points > 0 ? `+${t.points}` : t.points}
                    </td>
                    <td className="text-right font-mono text-xs font-semibold text-ink-900">
                      {t.balanceAfter}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl shadow-xl border border-ink-150 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-ink-150 bg-ink-50 flex items-center justify-between">
              <h3 className="font-semibold text-sm text-ink-900">Adjust Loyalty Points</h3>
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="text-ink-400 hover:text-ink-700 text-lg leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAdjust} className="p-5 space-y-4">
              {error && (
                <div className="alert-error text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Points to Add / Deduct</label>
                <input
                  type="number"
                  required
                  value={adjustPoints}
                  onChange={(e) => setAdjustPoints(parseInt(e.target.value) || 0)}
                  className="input input-sm w-full font-mono font-bold"
                />
                <span className="text-[11px] text-ink-400 block">
                  Enter positive value to add (e.g. 50), or negative to deduct (e.g. -20).
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-ink-700">Reason / Note</label>
                <input
                  type="text"
                  required
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  className="input input-sm w-full"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-ink-150">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || adjustPoints === 0}
                  className="btn btn-primary btn-sm"
                >
                  <Check className="h-4 w-4" /> {isPending ? "Updating…" : "Apply Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
