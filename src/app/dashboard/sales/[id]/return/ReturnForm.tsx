"use client";

import { useState, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  RotateCcw,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  AlertOctagon,
  CreditCard,
  Banknote,
  Building,
  FileText,
} from "lucide-react";
import { formatINR } from "@/lib/format";
import { computeSaleLine } from "@/lib/money";
import { createSaleReturnAction } from "@/app/actions/sales";
import type { ReturnableSaleDetails } from "@/server/domain/sales/return-sale";

interface ReturnFormProps {
  data: ReturnableSaleDetails;
}

interface ReturnRowState {
  packQty: number;
  looseQty: number;
}

export function ReturnForm({ data }: ReturnFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { sale, items, customer } = data;

  // Initialize return row state: map of saleItemId -> { packQty, looseQty }
  const [rowQuantities, setRowQuantities] = useState<Record<string, ReturnRowState>>(() => {
    const initial: Record<string, ReturnRowState> = {};
    for (const item of items) {
      initial[item.id] = { packQty: 0, looseQty: 0 };
    }
    return initial;
  });

  const [refundMethod, setRefundMethod] = useState<"cash" | "upi" | "card" | "credit_note" | "bank">("cash");
  const [reason, setReason] = useState("");

  // Update pack quantity for an item
  const handlePackChange = (itemId: string, val: number) => {
    setRowQuantities((prev) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return prev;
      const currentLoose = prev[itemId]?.looseQty || 0;
      const upp = item.unitsPerPack || 1;
      const requestedBase = val * upp + currentLoose;
      const clampedBase = Math.min(requestedBase, item.availableBaseQty);
      const clampedPack = Math.floor(clampedBase / upp);
      const clampedLoose = clampedBase % upp;
      return {
        ...prev,
        [itemId]: { packQty: clampedPack, looseQty: clampedLoose },
      };
    });
  };

  // Update loose quantity for an item
  const handleLooseChange = (itemId: string, val: number) => {
    setRowQuantities((prev) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return prev;
      const currentPack = prev[itemId]?.packQty || 0;
      const upp = item.unitsPerPack || 1;
      const requestedBase = currentPack * upp + val;
      const clampedBase = Math.min(requestedBase, item.availableBaseQty);
      const clampedPack = Math.floor(clampedBase / upp);
      const clampedLoose = clampedBase % upp;
      return {
        ...prev,
        [itemId]: { packQty: clampedPack, looseQty: clampedLoose },
      };
    });
  };

  // Quick action: Return all available units for an item
  const handleReturnAll = (itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const upp = item.unitsPerPack || 1;
    const pack = Math.floor(item.availableBaseQty / upp);
    const loose = item.availableBaseQty % upp;
    setRowQuantities((prev) => ({
      ...prev,
      [itemId]: { packQty: pack, looseQty: loose },
    }));
  };

  // Quick action: Clear return quantity for an item
  const handleClearItem = (itemId: string) => {
    setRowQuantities((prev) => ({
      ...prev,
      [itemId]: { packQty: 0, looseQty: 0 },
    }));
  };

  // Calculate live return totals
  const returnCalculations = useMemo(() => {
    let totalTaxable = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalAmount = 0;
    let totalItemsReturning = 0;
    let returningExpiredCount = 0;

    const lineCalculations: Record<
      string,
      {
        baseQty: number;
        packQty: number;
        looseQty: number;
        taxable: number;
        tax: number;
        total: number;
      }
    > = {};

    for (const item of items) {
      const q = rowQuantities[item.id] || { packQty: 0, looseQty: 0 };
      const upp = item.unitsPerPack || 1;
      const baseQty = q.packQty * upp + q.looseQty;

      if (baseQty > 0) {
        totalItemsReturning++;
        if (item.isBatchExpired) {
          returningExpiredCount++;
        }

        const calc = computeSaleLine(
          {
            qty: baseQty,
            rate: item.rate,
            discountBp: item.discountBp,
            gstRateBp: item.gstRateBp,
            unitsPerPack: upp,
          },
          sale.isInterState,
        );

        const lineTax = calc.cgst + calc.sgst + calc.igst;
        totalTaxable += calc.taxable;
        totalCgst += calc.cgst;
        totalSgst += calc.sgst;
        totalIgst += calc.igst;
        totalAmount += calc.total;

        lineCalculations[item.id] = {
          baseQty,
          packQty: q.packQty,
          looseQty: q.looseQty,
          taxable: calc.taxable,
          tax: lineTax,
          total: calc.total,
        };
      } else {
        lineCalculations[item.id] = {
          baseQty: 0,
          packQty: 0,
          looseQty: 0,
          taxable: 0,
          tax: 0,
          total: 0,
        };
      }
    }

    return {
      lineCalculations,
      totalTaxable,
      totalTax: totalCgst + totalSgst + totalIgst,
      totalCgst,
      totalSgst,
      totalIgst,
      totalAmount,
      totalItemsReturning,
      returningExpiredCount,
    };
  }, [items, rowQuantities, sale.isInterState]);

  // Form submission handler
  const handleSubmitReturn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (returnCalculations.totalItemsReturning === 0) {
      setError("Please specify a return quantity for at least one item.");
      return;
    }

    if (reason.trim().length < 3) {
      setError("Please provide a valid return reason (at least 3 characters).");
      return;
    }

    const payloadItems = items
      .filter((item) => (returnCalculations.lineCalculations[item.id]?.baseQty || 0) > 0)
      .map((item) => {
        const q = rowQuantities[item.id];
        return {
          saleItemId: item.id,
          packQty: q.packQty,
          looseQty: q.looseQty,
          qty: returnCalculations.lineCalculations[item.id].baseQty,
        };
      });

    startTransition(async () => {
      const res = await createSaleReturnAction({
        saleId: sale.id,
        items: payloadItems,
        refundMethod,
        reason: reason.trim(),
      });

      if (!res.success) {
        setError(res.error || "Failed to process sale return.");
      } else {
        router.push(`/dashboard/sales/returns/${res.returnId}/print`);
      }
    });
  };

  // Keyboard shortcut listener (Alt+S or Ctrl+Enter to submit, Esc to go back)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey && e.key.toLowerCase() === "s") || (e.ctrlKey && e.key === "Enter")) {
        e.preventDefault();
        handleSubmitReturn();
      } else if (e.key === "Escape") {
        e.preventDefault();
        router.push(`/dashboard/sales/${sale.id}`);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <form onSubmit={handleSubmitReturn} className="space-y-6">
      {/* Return Information Banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-amber-950 shadow-xs flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-bold text-amber-900 text-[15px]">
            <RotateCcw className="h-5 w-5 text-amber-700" />
            <span>Process Sale Return & GST Credit Note</span>
          </div>
          <p className="text-[13px] text-amber-800">
            Original Invoice: <strong>{sale.invoiceNo}</strong> &bull; Customer:{" "}
            <strong>{customer?.name || "Walk-in Customer"}</strong> &bull; Bill Total:{" "}
            <strong>{formatINR(sale.totalAmount)}</strong>
          </p>
          <p className="text-[12px] text-amber-700/90">
            Returned quantities are verified against remaining sold units. An official GST Credit Note sequence (<code>CN/YY-YY/...</code>) will be generated and balanced in the general ledger.
          </p>
        </div>
        <Link href={`/dashboard/sales/${sale.id}`} className="btn btn-secondary text-xs shrink-0">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" />
          Back to Invoice <kbd className="ml-1 text-[10px] text-ink-500 font-mono">Esc</kbd>
        </Link>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 flex items-start gap-3 text-sm">
          <AlertOctagon className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{error}</div>
        </div>
      )}

      {/* Return Items Selection Table */}
      <div className="card overflow-hidden shadow-xs">
        <div className="card-header !py-3 bg-ink-50/50 border-b border-ink-150 flex items-center justify-between">
          <div>
            <h3 className="card-title text-[14px]">Select Return Items</h3>
            <p className="card-subtitle text-[12px]">
              Specify pack and loose tablets to return. Maximum returnable quantities are strictly enforced.
            </p>
          </div>
          <span className="badge badge-neutral text-xs font-mono">
            {returnCalculations.totalItemsReturning} item(s) selected
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Medicine / Salt</th>
                <th>Batch / Expiry</th>
                <th className="text-center">Sold Units</th>
                <th className="text-center">Returned</th>
                <th className="text-center font-bold text-amber-800">Returnable Qty</th>
                <th className="text-center w-52">Return Qty</th>
                <th className="text-right">Unit Rate</th>
                <th className="text-right">Taxable</th>
                <th className="text-right">Refund Total</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const q = rowQuantities[item.id] || { packQty: 0, looseQty: 0 };
                const calc = returnCalculations.lineCalculations[item.id] || {
                  baseQty: 0,
                  taxable: 0,
                  total: 0,
                };
                const isFullyReturned = item.availableBaseQty <= 0;
                const isSelected = calc.baseQty > 0;

                return (
                  <tr
                    key={item.id}
                    className={`${isFullyReturned ? "opacity-50 bg-ink-50/30" : ""} ${
                      isSelected ? "bg-amber-50/30 font-medium" : ""
                    }`}
                  >
                    <td>
                      <div className="font-bold text-ink-900">{item.medicineName}</div>
                      <div className="cell-sub text-[11px] text-ink-500">
                        1 {item.packUnit} = {item.unitsPerPack} {item.looseUnit}s
                      </div>
                    </td>

                    <td>
                      <div className="font-mono text-[12.5px] font-medium text-ink-800">{item.batchNo}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="cell-sub num">{item.expiryDate}</span>
                        {item.isBatchExpired && (
                          <span className="badge badge-danger text-[10px] px-1 py-0 font-bold uppercase tracking-wider">
                            Expired (Quarantine)
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="text-center">
                      <span className="font-mono text-ink-700">{item.soldBaseQty}</span>
                      <div className="cell-sub text-[11px]">
                        {item.soldPackQty > 0 ? `${item.soldPackQty} ${item.packUnit} ` : ""}
                        {item.soldLooseQty > 0 ? `${item.soldLooseQty} ${item.looseUnit}` : ""}
                      </div>
                    </td>

                    <td className="text-center font-mono text-ink-500">
                      {item.returnedQty > 0 ? (
                        <span className="text-amber-700 font-semibold">{item.returnedQty}</span>
                      ) : (
                        "0"
                      )}
                    </td>

                    <td className="text-center">
                      <span className="badge badge-neutral num font-bold text-[13px]">
                        {item.availableBaseQty}
                      </span>
                      <div className="cell-sub text-[11px]">
                        {item.availablePackQty > 0 ? `${item.availablePackQty} ${item.packUnit} ` : ""}
                        {item.availableLooseQty > 0 ? `${item.availableLooseQty} ${item.looseUnit}` : ""}
                      </div>
                    </td>

                    {/* Return Quantity Inputs */}
                    <td className="text-center">
                      {isFullyReturned ? (
                        <span className="text-xs text-ink-400 italic">Fully Returned</span>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="flex flex-col items-center">
                            <input
                              type="number"
                              min={0}
                              max={item.availablePackQty}
                              value={q.packQty || ""}
                              placeholder="0"
                              onChange={(e) => handlePackChange(item.id, parseInt(e.target.value, 10) || 0)}
                              className="input text-center py-1 px-1.5 text-sm w-16 font-mono font-bold"
                              title={`Packs (${item.packUnit})`}
                            />
                            <span className="text-[10px] text-ink-400 uppercase">{item.packUnit}</span>
                          </div>

                          {item.unitsPerPack > 1 && (
                            <>
                              <span className="text-ink-400 font-bold">+</span>
                              <div className="flex flex-col items-center">
                                <input
                                  type="number"
                                  min={0}
                                  max={item.unitsPerPack - 1}
                                  value={q.looseQty || ""}
                                  placeholder="0"
                                  onChange={(e) => handleLooseChange(item.id, parseInt(e.target.value, 10) || 0)}
                                  className="input text-center py-1 px-1.5 text-sm w-16 font-mono font-bold"
                                  title={`Loose units (${item.looseUnit})`}
                                />
                                <span className="text-[10px] text-ink-400 uppercase">{item.looseUnit}</span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="text-right num text-ink-700">{formatINR(item.rate)}</td>

                    <td className="text-right num text-ink-700">
                      {calc.baseQty > 0 ? formatINR(calc.taxable) : "—"}
                    </td>

                    <td className="text-right num font-bold text-ink-900">
                      {calc.baseQty > 0 ? (
                        <span className="text-amber-800">{formatINR(calc.total)}</span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="text-center">
                      {!isFullyReturned && (
                        <div className="flex items-center justify-center gap-1">
                          {calc.baseQty > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleClearItem(item.id)}
                              className="btn btn-secondary !py-0.5 !px-1.5 text-[11px] text-rose-700 hover:text-rose-900"
                              title="Clear return quantity"
                            >
                              Clear
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReturnAll(item.id)}
                              className="btn btn-secondary !py-0.5 !px-1.5 text-[11px] text-amber-700 hover:text-amber-900"
                              title="Return all available"
                            >
                              Max
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Return Settlement, Reason & Financial Breakdown Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Refund Method & Reason */}
        <div className="lg:col-span-7 card p-5 space-y-4 shadow-xs">
          <h4 className="text-[14px] font-bold text-ink-900 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Refund Settlement Details
          </h4>

          {/* Refund Method Radio Buttons */}
          <div className="space-y-2">
            <label className="text-[12px] font-bold text-ink-700 uppercase tracking-wider">
              Refund / Settlement Method
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { id: "cash", label: "Cash", icon: Banknote },
                { id: "upi", label: "UPI / QR", icon: CreditCard },
                { id: "card", label: "Card", icon: CreditCard },
                { id: "bank", label: "Bank Transfer", icon: Building },
                { id: "credit_note", label: "Customer Ledger", icon: FileText },
              ].map((m) => {
                const Icon = m.icon;
                const isChecked = refundMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setRefundMethod(m.id as typeof refundMethod)}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-left transition-all ${
                      isChecked
                        ? "border-amber-600 bg-amber-50/80 text-amber-950 font-bold shadow-xs ring-1 ring-amber-600"
                        : "border-ink-200 bg-white hover:bg-ink-50 text-ink-700"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isChecked ? "text-amber-700" : "text-ink-500"}`} />
                    <span className="text-[13px]">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Return Reason (Statutory requirement) */}
          <div className="space-y-1.5 pt-2">
            <label htmlFor="return-reason" className="text-[12px] font-bold text-ink-700 uppercase tracking-wider">
              Reason for Return <span className="text-rose-600">*</span>
            </label>
            <input
              id="return-reason"
              type="text"
              required
              minLength={3}
              maxLength={255}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Doctor changed medicine, Excess strips, Patient recovered, Defective seal..."
              className="input w-full text-sm"
            />
            <p className="text-[11px] text-ink-500">
              Mandatory note printed on the GST Credit Note and recorded in statutory pharma audit logs.
            </p>
          </div>

          {/* Expired Quarantine Notice if applicable */}
          {returnCalculations.returningExpiredCount > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-3 text-rose-950 text-xs flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>Statutory Expiry Quarantine:</strong> One or more selected batches have passed their expiry date. These items will be automatically marked as <code>hold</code> (quarantine) upon return and cannot be resold.
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Totals Summary & Submit Button */}
        <div className="lg:col-span-5 card p-5 space-y-4 shadow-xs bg-ink-25/50">
          <h4 className="text-[14px] font-bold text-ink-900 border-b border-ink-150 pb-2">
            Credit Note Summary
          </h4>

          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between text-ink-600">
              <span>Returning Items</span>
              <span className="font-semibold text-ink-900 font-mono">
                {returnCalculations.totalItemsReturning} line(s)
              </span>
            </div>
            <div className="flex justify-between text-ink-600">
              <span>Return Taxable Value</span>
              <span className="num font-medium text-ink-800">
                {formatINR(returnCalculations.totalTaxable)}
              </span>
            </div>
            {sale.isInterState ? (
              <div className="flex justify-between text-ink-600">
                <span>Integrated GST (IGST)</span>
                <span className="num font-medium text-ink-800">
                  {formatINR(returnCalculations.totalIgst)}
                </span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-ink-600">
                  <span>Central GST (CGST)</span>
                  <span className="num font-medium text-ink-800">
                    {formatINR(returnCalculations.totalCgst)}
                  </span>
                </div>
                <div className="flex justify-between text-ink-600">
                  <span>State GST (SGST)</span>
                  <span className="num font-medium text-ink-800">
                    {formatINR(returnCalculations.totalSgst)}
                  </span>
                </div>
              </>
            )}

            <div className="pt-3 border-t border-ink-200 flex justify-between items-baseline">
              <span className="font-bold text-ink-900 text-[14px]">Total Credit Amount</span>
              <span className="font-black text-amber-700 text-2xl num">
                {formatINR(returnCalculations.totalAmount)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 space-y-2">
            <button
              type="submit"
              disabled={isPending || returnCalculations.totalItemsReturning === 0 || reason.trim().length < 3}
              className="btn btn-primary w-full justify-center !py-2.5 text-[14px] font-bold !bg-amber-600 hover:!bg-amber-700 focus:!ring-amber-500 shadow-sm"
            >
              {isPending ? (
                <span>Generating Credit Note...</span>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Issue Credit Note
                  <kbd className="ml-2 rounded bg-amber-800/40 px-1.5 py-0.5 text-[10.5px] font-mono text-amber-100">
                    Alt+S
                  </kbd>
                </>
              )}
            </button>

            <Link
              href={`/dashboard/sales/${sale.id}`}
              className="btn btn-secondary w-full justify-center text-xs"
            >
              Cancel & Return to Bill
            </Link>
          </div>
        </div>
      </div>
    </form>
  );
}
