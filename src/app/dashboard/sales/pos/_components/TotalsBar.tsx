"use client";

import { CreditCard, Banknote, QrCode, Lock, Loader2, Printer } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { DocTotals } from "@/lib/money";

interface TotalsBarProps {
  totals: DocTotals;
  loyaltyDiscountPaise: number;
  itemCount: number;
  paymentMethod: string;
  isSubmitting: boolean;
  canBill: boolean;
  onSetPaymentMethod: (method: string) => void;
  onOpenSplitModal: () => void;
  onCompleteSale: () => void;
}

export function TotalsBar({
  totals,
  loyaltyDiscountPaise,
  itemCount,
  paymentMethod,
  isSubmitting,
  canBill,
  onSetPaymentMethod,
  onOpenSplitModal,
  onCompleteSale,
}: TotalsBarProps) {
  const totalTax = (totals.cgst ?? 0) + (totals.sgst ?? 0) + (totals.igst ?? 0);

  return (
    <div className="card p-4 shadow-xs space-y-3.5">
      {/* Financial Breakdown */}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between text-ink-600">
          <span>Items ({itemCount}):</span>
          <span className="font-mono">{formatINR(totals.gross)}</span>
        </div>

        {totals.discount > 0 && (
          <div className="flex justify-between text-emerald-700 font-semibold">
            <span>Item Discounts:</span>
            <span className="font-mono">-{formatINR(totals.discount - loyaltyDiscountPaise)}</span>
          </div>
        )}

        {loyaltyDiscountPaise > 0 && (
          <div className="flex justify-between text-amber-700 font-semibold">
            <span>Loyalty Points Discount:</span>
            <span className="font-mono">-{formatINR(loyaltyDiscountPaise)}</span>
          </div>
        )}

        <div className="flex justify-between text-ink-600">
          <span>Taxable Amount:</span>
          <span className="font-mono">{formatINR(totals.taxable)}</span>
        </div>

        <div className="flex justify-between text-ink-600">
          <span>GST (Taxes):</span>
          <span className="font-mono">{formatINR(totalTax)}</span>
        </div>

        {totals.roundOff !== 0 && (
          <div className="flex justify-between text-ink-500 text-[11px]">
            <span>Round off:</span>
            <span className="font-mono">{totals.roundOff > 0 ? `+${formatINR(totals.roundOff)}` : `-${formatINR(Math.abs(totals.roundOff))}`}</span>
          </div>
        )}

        <div className="border-t border-ink-100 pt-2 flex justify-between items-baseline">
          <span className="text-sm font-bold text-ink-900">Total Payable:</span>
          <span className="text-2xl font-bold font-mono text-ink-950">
            {formatINR(totals.total)}
          </span>
        </div>
      </div>

      {/* Payment Mode Selector Buttons */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-ink-600">Payment Tender</label>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onSetPaymentMethod("cash")}
            className={`btn btn-sm !text-xs font-bold py-2 ${
              paymentMethod === "cash"
                ? "btn-primary !bg-emerald-600 !border-emerald-600 text-white"
                : "btn-secondary"
            }`}
          >
            <Banknote className="w-3.5 h-3.5 mr-1 inline" /> Cash
          </button>
          <button
            type="button"
            onClick={() => onSetPaymentMethod("upi")}
            className={`btn btn-sm !text-xs font-bold py-2 ${
              paymentMethod === "upi"
                ? "btn-primary !bg-sky-600 !border-sky-600 text-white"
                : "btn-secondary"
            }`}
          >
            <QrCode className="w-3.5 h-3.5 mr-1 inline" /> UPI
          </button>
          <button
            type="button"
            onClick={() => onSetPaymentMethod("card")}
            className={`btn btn-sm !text-xs font-bold py-2 ${
              paymentMethod === "card"
                ? "btn-primary !bg-indigo-600 !border-indigo-600 text-white"
                : "btn-secondary"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 mr-1 inline" /> Card
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenSplitModal}
          className="btn btn-secondary btn-sm w-full !text-xs font-semibold py-1.5 text-brand-700 border-brand-200 hover:bg-brand-50"
        >
          <CreditCard className="w-3.5 h-3.5 mr-1 text-brand-600" /> Split Tender / Credit (F8)
        </button>
      </div>

      {/* Complete Sale Primary Action */}
      <div>
        <button
          type="button"
          onClick={onCompleteSale}
          disabled={!canBill || itemCount === 0 || isSubmitting}
          className="btn btn-primary w-full py-3 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"
          title="Complete and print invoice (F10)"
        >
          {isSubmitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : !canBill ? (
            <>
              <Lock className="w-4 h-4" /> Open Register First
            </>
          ) : (
            <>
              <Printer className="w-4 h-4" /> Finalize Bill (F10)
            </>
          )}
        </button>
      </div>
    </div>
  );
}
