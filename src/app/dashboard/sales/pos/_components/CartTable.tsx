"use client";

import { useState } from "react";
import { ShoppingCart, Trash2, AlertTriangle, AlertCircle, ShieldAlert, Sparkles, Tag, Zap } from "lucide-react";
import { formatINR } from "@/lib/format";
import { computeSaleLine } from "@/lib/money";
import { computeFefoPreview, isFefoOverride } from "@/lib/fefo";
import { FefoOverrideModal } from "./FefoOverrideModal";
import { useCartKeyboard } from "./useCartKeyboard";
import type { PosCartLine } from "../_state/types";
import type { SearchResultBatch } from "../_data/posData";

export function ScheduleBadge({ schedule }: { schedule: string }) {
  const norm = schedule.trim().toUpperCase();
  if (norm === "H1") {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-bold font-mono bg-rose-100 text-rose-800 border border-rose-300 shadow-xs"
        title="Schedule H1: Separate register entry & doctor details required"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
        Rx · Sched H1
      </span>
    );
  }
  if (norm === "X") {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-bold font-mono bg-purple-100 text-purple-800 border border-purple-300 shadow-xs"
        title="Schedule X: NDPS Controlled Substance. Duplicate prescription required."
      >
        <span className="w-1.5 h-1.5 rounded-full bg-purple-600" />
        NDPS · Sched X
      </span>
    );
  }
  if (norm === "H") {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold font-mono bg-amber-100 text-amber-800 border border-amber-300"
        title="Schedule H: Prescription required"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
        Rx · Sched H
      </span>
    );
  }
  return (
    <span className="badge badge-neutral !text-[10px] font-mono">
      Sched {schedule}
    </span>
  );
}

interface CartTableProps {
  cart: PosCartLine[];
  revalidationAlert?: { hasIssues: boolean; hasStockShortage: boolean; hasExpiredBatches: boolean; message: string } | null;
  rxWarning: boolean;
  controlledItems: PosCartLine[];
  onUpdatePackQty: (batchId: string, packQty: number) => void;
  onUpdateLooseQty: (batchId: string, looseQty: number) => void;
  onUpdateDiscount: (batchId: string, discountBp: number) => void;
  onUpdateBatch: (oldBatchId: string, newBatch: SearchResultBatch, reason?: string) => void;
  onCapToMax?: (batchId: string, maxUnits: number) => void;
  onRemoveLine: (batchId: string) => void;
  onOpenSubstitutes: (genericName: string) => void;
  onFocusSearch?: () => void;
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
  onCapToMax,
  onRemoveLine,
  onOpenSubstitutes,
  onFocusSearch,
}: CartTableProps) {
  const [pendingOverride, setPendingOverride] = useState<{
    line: PosCartLine;
    targetBatch: SearchResultBatch;
    skippedBatches: SearchResultBatch[];
  } | null>(null);

  const { selectedRowIndex, setSelectedRowIndex, rowRefs, handleRowKeyDown } = useCartKeyboard({
    cart,
    onRemoveLine,
    onUpdatePackQty,
    onUpdateLooseQty,
    onFocusSearch,
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  const handleBatchSelect = (line: PosCartLine, newBatchId: string) => {
    if (newBatchId === line.batchId) return;
    const chosen = line.availableBatches?.find((b) => b.id === newBatchId);
    if (!chosen) return;
    const overrideCheck = isFefoOverride(chosen, line.availableBatches ?? [], todayStr);
    if (overrideCheck.isOverride) {
      setPendingOverride({ line, targetBatch: chosen, skippedBatches: overrideCheck.skippedBatches });
    } else {
      onUpdateBatch(line.batchId, chosen);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-2">
      {revalidationAlert && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900 shadow-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1"><span className="font-bold">Parked Cart Revalidation Alert:</span> {revalidationAlert.message}</div>
        </div>
      )}

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
              <span>Schedule {controlledItems.map((i) => i.schedule).join(", ")} items present. Prescriber & patient details required.</span>
            </div>
          )}
        </div>
      )}

      <div className="card flex-1 overflow-hidden flex flex-col shadow-xs">
        {cart.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-ink-400">
            <div className="w-14 h-14 rounded-2xl bg-ink-100 flex items-center justify-center mb-3"><ShoppingCart className="h-7 w-7 text-ink-300" /></div>
            <p className="font-semibold text-ink-700 text-sm">Cart is empty</p>
            <p className="text-xs text-ink-400 mt-1 max-w-xs">Press <kbd className="px-1.5 py-0.5 rounded bg-ink-200 font-mono text-[11px] font-bold">F2</kbd> to search medicines or scan a product barcode.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto overflow-y-auto min-w-0">
            <table className="data-table min-w-[680px] w-full">
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
                  const lineCalc = computeSaleLine({
                    packQty: line.packQty,
                    looseQty: line.looseQty,
                    unitsPerPack: line.unitsPerPack,
                    rate: line.saleRate ?? line.mrp,
                    discountBp: line.discountBp,
                    gstRateBp: line.gstRateBp,
                  });
                  const fefoPreview = line.autoFefo && line.availableBatches && line.availableBatches.length > 0
                    ? computeFefoPreview(line.availableBatches, lineCalc.baseQty, todayStr)
                    : null;
                  const availableStock = line.autoFefo
                    ? (fefoPreview?.totalAvailable ?? line.totalAvailableStock ?? line.qtyOnHand)
                    : line.qtyOnHand;
                  const isStockShortage = availableStock < lineCalc.baseQty;
                  const isAtStockLimit = availableStock > 0 && availableStock === lineCalc.baseQty;

                  return (
                    <tr
                      key={line.batchId}
                      data-cart-row="true"
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      tabIndex={selectedRowIndex === idx ? 0 : -1}
                      onClick={() => setSelectedRowIndex(idx)}
                      onKeyDown={(e) => handleRowKeyDown(e, idx)}
                      className={`transition-colors outline-none cursor-pointer ${
                        isStockShortage
                          ? "bg-rose-50/70 ring-1 ring-inset ring-rose-300"
                          : selectedRowIndex === idx
                          ? "bg-brand-50/50 ring-1 ring-inset ring-brand-400"
                          : ""
                      }`}
                    >
                      <td className="text-ink-400 font-mono text-xs">{idx + 1}</td>
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-ink-900 text-sm">{line.medicineName}</span>
                          {line.schedule && <ScheduleBadge schedule={line.schedule} />}
                          {line.schemeText && <span className="badge badge-brand !text-[10px] flex items-center gap-0.5 font-mono"><Tag className="w-2.5 h-2.5 inline" /> {line.schemeText}</span>}
                        </div>
                        <div className="text-[11.5px] text-ink-500 font-mono flex items-center gap-2">
                          <span>{line.genericName || "—"}</span>
                          {line.genericName && (
                            <button type="button" onClick={() => onOpenSubstitutes(line.genericName!)} className="text-brand-600 hover:text-brand-800 text-[11px] underline inline-flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" /> Alt
                            </button>
                          )}
                        </div>
                        {fefoPreview?.isSplit && !isStockShortage && (
                          <div className="inline-flex items-center gap-1 text-[10.5px] font-mono font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 mt-1 max-w-fit">
                            <Zap className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                            <span>Auto-FEFO: {fefoPreview.summaryText}</span>
                          </div>
                        )}
                        {line.overrideBatch && line.overrideReason && (
                          <div className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mt-1 max-w-fit" title={line.overrideReason}>
                            <span>Override: {line.overrideReason}</span>
                          </div>
                        )}
                        {isStockShortage && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-rose-700 bg-rose-100/80 border border-rose-200 rounded-md px-2 py-0.5 max-w-fit">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>
                              {availableStock <= 0
                                ? "Out of stock (0 available)"
                                : `Stock limit exceeded: requested ${lineCalc.baseQty}, only ${availableStock} ${line.looseUnit}s available`}
                            </span>
                            {availableStock > 0 && onCapToMax && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCapToMax(line.batchId, availableStock);
                                }}
                                className="underline font-bold text-rose-900 hover:text-rose-700 ml-1"
                              >
                                Cap to {availableStock}
                              </button>
                            )}
                          </div>
                        )}
                        {isAtStockLimit && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[10.5px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                            <span>Max stock limit reached ({availableStock} {line.looseUnit}s)</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {line.availableBatches && line.availableBatches.length > 1 ? (
                            <select value={line.batchId} onChange={(e) => handleBatchSelect(line, e.target.value)} className="select !py-0.5 !px-1.5 !text-[11px] !font-mono font-semibold">
                              {line.availableBatches.map((b) => (
                                <option key={b.id} value={b.id}>{b.batchNo} (Exp {b.expiryDate}, Stk: {b.qtyOnHand})</option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-mono text-xs font-semibold text-ink-800">{line.batchNo}</span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-500 font-mono">Exp: {line.expiryDate} · Stk: {line.qtyOnHand}</div>
                      </td>
                      <td className="text-center">
                        <input
                          type="number"
                          min="0"
                          data-cart-input="pack"
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
                              data-cart-input="loose"
                              value={line.looseQty === 0 ? "" : line.looseQty}
                              onChange={(e) => onUpdateLooseQty(line.batchId, parseInt(e.target.value, 10) || 0)}
                              className="input !py-1 !px-2 text-center font-mono font-bold text-xs w-20"
                              placeholder="0"
                            />
                            <span className="text-[9.5px] text-ink-400 font-mono mt-0.5">(1 {line.packUnit} = {line.unitsPerPack})</span>
                            {line.packQty > 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdatePackQty(line.batchId, 0);
                                  if (line.looseQty === 0) onUpdateLooseQty(line.batchId, 1);
                                }}
                                data-tooltip={`Switch to loose ${line.looseUnit}s only (sets Pack to 0)`}
                                className="text-[10px] font-semibold text-brand-700 hover:underline mt-0.5"
                              >
                                Loose only
                              </button>
                            )}
                          </div>
                        ) : (
                          <span
                            className="text-ink-300 text-xs cursor-help"
                            data-tooltip="1 unit/pack — set Units / Pack > 1 in Item Master (/dashboard/inventory) to sell loose tablets"
                          >
                            —
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <span className="font-mono text-xs font-semibold text-ink-800">{formatINR(line.saleRate ?? line.mrp)}</span>
                        {line.unitsPerPack > 1 && (
                          <div className="text-[10px] text-brand-700 font-mono font-medium">{formatINR(Math.round((line.saleRate ?? line.mrp) / line.unitsPerPack))}/{line.looseUnit}</div>
                        )}
                        <div className="text-[10px] text-ink-400 font-mono">GST {line.gstRateBp / 100}%</div>
                      </td>
                      <td className="text-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          data-cart-input="discount"
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
                        <span className="font-mono font-bold text-xs text-ink-900">{formatINR(lineCalc.total)}</span>
                      </td>
                      <td className="text-center">
                        <button type="button" onClick={() => onRemoveLine(line.batchId)} className="btn btn-ghost btn-icon !h-7 !w-7 text-ink-400 hover:text-rose-600" title="Remove item">
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

      {pendingOverride && (
        <FefoOverrideModal
          key={`${pendingOverride.line.batchId}-${pendingOverride.targetBatch.id}`}
          isOpen={true}
          medicineName={pendingOverride.line.medicineName}
          targetBatch={pendingOverride.targetBatch}
          skippedBatches={pendingOverride.skippedBatches}
          onConfirm={(reason) => {
            onUpdateBatch(pendingOverride.line.batchId, pendingOverride.targetBatch, reason);
            setPendingOverride(null);
          }}
          onCancel={() => setPendingOverride(null)}
        />
      )}
    </div>
  );
}
