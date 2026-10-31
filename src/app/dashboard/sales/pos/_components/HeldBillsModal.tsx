"use client";

import { useState, useEffect } from "react";
import { Layers, BookmarkCheck, Trash2, Clock, X, AlertTriangle, Loader2 } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { PosDataSource, HeldSaleItem } from "../_data/posData";

interface HeldBillsModalProps {
  isListOpen: boolean;
  isParkOpen: boolean;
  itemCount: number;
  dataSource: PosDataSource;
  onHoldBill: (notes: string) => Promise<void>;
  onResumeBill: (heldSaleId: string) => Promise<void>;
  onClose: () => void;
}

export function HeldBillsModal({
  isListOpen,
  isParkOpen,
  itemCount,
  dataSource,
  onHoldBill,
  onResumeBill,
  onClose,
}: HeldBillsModalProps) {
  const [parkNotes, setParkNotes] = useState("");
  const [isHolding, setIsHolding] = useState(false);
  const [heldSales, setHeldSales] = useState<HeldSaleItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResumingId, setIsResumingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!isListOpen) return;

    async function fetchHeld() {
      setIsLoading(true);
      try {
        const res = await dataSource.listHeldSales();
        if (active) setHeldSales(res.sales);
      } catch (err) {
        console.error("Error loading held sales:", err);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    fetchHeld();
    return () => {
      active = false;
    };
  }, [isListOpen, dataSource]);

  if (!isListOpen && !isParkOpen) return null;

  // Park Current Bill Modal
  if (isParkOpen) {
    return (
      <div className="fixed inset-0 bg-ink-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
        <div className="card w-full max-w-sm p-5 shadow-pop space-y-4">
          <div className="flex items-center justify-between border-b border-ink-100 pb-3">
            <div>
              <h3 className="font-bold text-base text-ink-900 flex items-center gap-2">
                <BookmarkCheck className="w-5 h-5 text-amber-600" /> Hold Current Bill (F6)
              </h3>
              <p className="text-xs text-ink-500 mt-0.5">Park {itemCount} items to serve another customer</p>
            </div>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-icon !h-7 !w-7">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Parking Reason / Notes</label>
              <input
                type="text"
                value={parkNotes}
                onChange={(e) => setParkNotes(e.target.value)}
                placeholder="e.g. Customer gone to fetch cash / UPI failure"
                className="input !py-1.5 text-xs mt-1"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
              <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
                Cancel (Esc)
              </button>
              <button
                type="button"
                disabled={isHolding}
                onClick={async () => {
                  setIsHolding(true);
                  try {
                    await onHoldBill(parkNotes);
                    setParkNotes("");
                    onClose();
                  } finally {
                    setIsHolding(false);
                  }
                }}
                className="btn btn-primary btn-sm px-4 font-bold bg-amber-600 hover:bg-amber-700"
              >
                {isHolding ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                Hold Bill (F6)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // List Parked Bills Modal
  return (
    <div className="fixed inset-0 bg-ink-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-xl p-5 shadow-pop space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div>
            <h3 className="font-bold text-base text-ink-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand-600" /> Parked Bills Register (F7)
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">Resume a previously parked transaction or discard stale bills</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon !h-7 !w-7">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-ink-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
              <span className="text-xs">Loading parked bills...</span>
            </div>
          ) : heldSales.length === 0 ? (
            <div className="text-center p-8 text-ink-400 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-ink-300" />
              <p className="font-semibold text-ink-700 text-xs">No parked bills found</p>
              <p className="text-[11px] text-ink-400">All counter transactions are settled or clear.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer / Notes</th>
                  <th>Items & Total</th>
                  <th>Parked At</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {heldSales.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <div className="font-semibold text-ink-900 text-xs">{h.customerName}</div>
                      {h.customerPhone && (
                        <div className="text-[11px] text-ink-500 font-mono">{h.customerPhone}</div>
                      )}
                      {h.notes && (
                        <div className="text-[11px] text-amber-800 italic mt-0.5">Note: {h.notes}</div>
                      )}
                    </td>
                    <td>
                      <div className="font-bold font-mono text-xs text-ink-900">
                        {formatINR(h.totalAmount)}
                      </div>
                      <div className="text-[11px] text-ink-500">{h.itemCount} item(s)</div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1 text-[11px] text-ink-600 font-mono">
                        <Clock className="w-3 h-3 text-ink-400" />
                        <span>{new Date(h.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      {h.isOlderThan24h && (
                        <span className="badge badge-warning !text-[9.5px] mt-0.5">
                          &gt;24h Aged
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={isResumingId === h.id}
                          onClick={async () => {
                            setIsResumingId(h.id);
                            try {
                              await onResumeBill(h.id);
                              onClose();
                            } finally {
                              setIsResumingId(null);
                            }
                          }}
                          className="btn btn-primary btn-sm !text-xs font-bold"
                        >
                          {isResumingId === h.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                          Resume
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (confirm("Discard this parked bill? This cannot be undone.")) {
                              await dataSource.discardHeldSale(h.id);
                              setHeldSales((prev) => prev.filter((x) => x.id !== h.id));
                            }
                          }}
                          className="btn btn-ghost btn-icon !h-7 !w-7 text-ink-400 hover:text-rose-600"
                          title="Discard parked bill"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t border-ink-100">
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
