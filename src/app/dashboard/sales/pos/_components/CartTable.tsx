"use client";

import { ShoppingCart, Trash2, AlertTriangle, ShieldAlert, Sparkles, Tag } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { PosCartLine } from "../_state/types";
import type { SearchResultBatch } from "../_data/posData";

interface CartTableProps {
  cart: PosCartLine[];
  revalidationAlert?: {
    hasIssues: boolean;
    hasStockShortage: boolean;
    hasExpiredBatches: boolean;
    message: string;
  } | null;
  rxWarning: boolean;
  controlledItems: PosCartLine[];
  onUpdatePackQty: (batchId: string, packQty: number) => void;
  onUpdateLooseQty: (batchId: string, looseQty: number) => void;
  onUpdateDiscount: (batchId: string, discountBp: number) => void;
  onUpdateBatch: (oldBatchId: string, newBatch: SearchResultBatch, reason?: string) => void;
  onRemoveLine: (batchId: string) => void;
  onOpenSubstitutes: (genericName: string) => void;
}

export function CartTable({
  cart,
  revalidationAlert,
  rxWarning,
  controlledItems,
  onUpdatePackQty,
  onUpdateLooseQty,
  onUpdateDiscount,
  onUpdateBatch,
  onRemoveLine,
  onOpenSubstitutes,
}: CartTableProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-2">
      {/* Revalidation Alert for Resumed Held Bills */}
      {revalidationAlert && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900 shadow-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold">Parked Cart Revalidation Alert:</span> {revalidationAlert.message}
          </div>
        </div>
      )}

      {/* Drug Warnings */}
      {(rxWarning || controlledItems.length > 0) && (
        <div className="flex gap-2 text-xs">
          {rxWarning && (
            <div className="flex-1 bg-amber-50/70 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              <span>Prescription required for one or more medicines in this cart.</span>
            </div>
          )}
          {controlledItems.length > 0 && (
            <div className="flex-1 bg-rose-50/70 border border-rose-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 text-rose-800">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-600 shrink-0" />
              <span>
                Schedule {controlledItems.map((i) => i.schedule).join(", ")} items present. Prescriber & patient details required.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Cart Items Table */}
      <div className="card flex-1 overflow-hidden flex flex-col shadow-xs">
        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-ink-400">
            <div className="w-14 h-14 rounded-2xl bg-ink-100 flex items-center justify-center mb-3">
              <ShoppingCart className="h-7 w-7 text-ink-300" />
            </div>
            <p className="font-semibold text-ink-700 text-sm">Cart is empty</p>
            <p className="text-xs text-ink-400 mt-1 max-w-xs">
              Press <kbd className="px-1.5 py-0.5 rounded bg-ink-200 font-mono text-[11px] font-bold">F2</kbd> to search medicines or scan a product barcode.
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="data-table">
              <thead className="sticky top-0 bg-ink-50 z-10">
                <tr>
                  <th className="w-8">#</th>
                  <th>Medicine</th>
                  <th>Batch / Expiry</th>
                  <th className="text-center w-28">Packs ({cart[0]?.packUnit || "Strip"})</th>
                  <th className="text-center w-28">Loose ({cart[0]?.looseUnit || "Tab"})</th>
                  <th className="text-right w-20">Rate</th>
                  <th className="text-center w-20">Disc %</th>
                  <th className="text-right w-24">Total</th>
                  <th className="w-10 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {cart.map((line, idx) => {
                  const unitRate = (line.saleRate ?? line.mrp) / line.unitsPerPack;
                  const grossPaise = Math.round(line.qty * unitRate);
                  const discountPaise = Math.round((grossPaise * line.discountBp) / 10000);
                  const lineTotalPaise = grossPaise - discountPaise;
                  const isStockShortage = line.qtyOnHand < line.qty;

                  return (
                    <tr key={line.batchId} className={isStockShortage ? "bg-rose-50/50" : undefined}>
                      <td className="text-ink-400 font-mono text-xs">{idx + 1}</td>
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-ink-900 text-sm">{line.medicineName}</span>
                          {line.schedule && (
                            <span className="badge badge-neutral !text-[10px] font-mono">
                              Sched {line.schedule}
                            </span>
                          )}
                          {line.schemeText && (
                            <span className="badge badge-brand !text-[10px] flex items-center gap-0.5 font-mono">
                              <Tag className="w-2.5 h-2.5 inline" /> {line.schemeText}
                            </span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-ink-500 font-mono flex items-center gap-2">
                          <span>{line.genericName || "—"}</span>
                          {line.genericName && (
                            <button
                              type="button"
                              onClick={() => onOpenSubstitutes(line.genericName!)}
                              className="text-brand-600 hover:text-brand-800 text-[11px] underline inline-flex items-center gap-0.5"
                            >
                              <Sparkles className="w-2.5 h-2.5" /> Alt
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {line.availableBatches && line.availableBatches.length > 1 ? (
                            <select
                              value={line.batchId}
                              onChange={(e) => {
                                const chosen = line.availableBatches?.find((b) => b.id === e.target.value);
                                if (chosen) onUpdateBatch(line.batchId, chosen);
                              }}
                              className="select !py-0.5 !px-1.5 !text-[11px] !font-mono font-semibold"
                            >
                              {line.availableBatches.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.batchNo} (Exp {b.expiryDate}, Stk: {b.qtyOnHand})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-mono text-xs font-semibold text-ink-800">
                              {line.batchNo}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-500 font-mono">
                          Exp: {line.expiryDate} · Stk: {line.qtyOnHand}
                        </div>
                      </td>
                      <td className="text-center">
                        <input
                          type="number"
                          min="0"
                          value={line.packQty === 0 && line.looseQty > 0 ? "" : line.packQty}
                          onChange={(e) => onUpdatePackQty(line.batchId, parseInt(e.target.value, 10) || 0)}
                          className="input !py-1 !px-2 text-center font-mono font-bold text-xs w-20"
                        />
                      </td>
                      <td className="text-center">
                        {line.unitsPerPack > 1 ? (
                          <div className="flex flex-col items-center">
                            <input
                              type="number"
                              min="0"
                              max={line.unitsPerPack - 1}
                              value={line.looseQty === 0 ? "" : line.looseQty}
                              onChange={(e) => onUpdateLooseQty(line.batchId, parseInt(e.target.value, 10) || 0)}
                              className="input !py-1 !px-2 text-center font-mono font-bold text-xs w-20"
                              placeholder="0"
                            />
                            <span className="text-[9.5px] text-ink-400 font-mono mt-0.5">
                              (1 {line.packUnit} = {line.unitsPerPack})
                            </span>
                          </div>
                        ) : (
                          <span className="text-ink-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="text-right">
                        <span className="font-mono text-xs font-semibold text-ink-800">
                          {formatINR(line.saleRate ?? line.mrp)}
                        </span>
                        <div className="text-[10px] text-ink-400 font-mono">
                          GST {line.gstRateBp / 100}%
                        </div>
                      </td>
                      <td className="text-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={line.discountBp === 0 ? "" : line.discountBp / 100}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            onUpdateDiscount(line.batchId, Math.round(val * 100));
                          }}
                          className="input !py-1 !px-1.5 text-center font-mono text-xs w-16"
                          placeholder="0%"
                        />
                      </td>
                      <td className="text-right">
                        <span className="font-mono font-bold text-xs text-ink-900">
                          {formatINR(lineTotalPaise)}
                        </span>
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          onClick={() => onRemoveLine(line.batchId)}
                          className="btn btn-ghost btn-icon !h-7 !w-7 text-ink-400 hover:text-rose-600"
                          title="Remove item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
