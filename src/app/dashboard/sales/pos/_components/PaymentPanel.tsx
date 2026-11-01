"use client";

import { useState, useEffect } from "react";
import { CreditCard, Banknote, QrCode, Sparkles, X, Loader2, AlertCircle } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { SplitPayments, SelectedCustomer } from "../_state/types";

interface PaymentPanelProps {
  isOpen: boolean;
  totalPaise: number;
  splitPayments: SplitPayments;
  customer: SelectedCustomer | null;
  redeemPoints: number;
  isSubmitting: boolean;
  errorMsg?: string;
  onUpdateSplit: (patch: Partial<SplitPayments>) => void;
  onUpdateRedeemPoints: (points: number) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export function PaymentPanel({
  isOpen,
  totalPaise,
  splitPayments,
  customer,
  redeemPoints,
  isSubmitting,
  errorMsg,
  onUpdateSplit,
  onUpdateRedeemPoints,
  onSubmit,
  onClose,
}: PaymentPanelProps) {
  if (!isOpen) return null;

  const cashPaise = Math.round((parseFloat(splitPayments.cash) || 0) * 100);
  const upiPaise = Math.round((parseFloat(splitPayments.upi) || 0) * 100);
  const cardPaise = Math.round((parseFloat(splitPayments.card) || 0) * 100);

  const totalTendered = cashPaise + upiPaise + cardPaise;
  const changeDuePaise = Math.max(0, totalTendered - totalPaise);
  const remainingDuePaise = Math.max(0, totalPaise - totalTendered);

  // Loyalty calculations
  const maxRedeemablePoints = customer?.redeemablePoints ?? 0;
  const pointRatePaise = maxRedeemablePoints > 0 && customer?.redeemableValuePaise
    ? Math.round(customer.redeemableValuePaise / maxRedeemablePoints)
    : 100;
  const currentLoyaltyDiscountPaise = redeemPoints * pointRatePaise;

  const handleSetExact = (method: "cash" | "upi" | "card") => {
    const netRupees = (totalPaise / 100).toFixed(2);
    if (method === "cash") onUpdateSplit({ cash: netRupees, upi: "", card: "" });
    else if (method === "upi") onUpdateSplit({ cash: "", upi: netRupees, card: "" });
    else if (method === "card") onUpdateSplit({ cash: "", upi: "", card: netRupees });
  };

  const handleSetMaxLoyalty = () => {
    // Cannot redeem more points than bill total
    const maxPointsForBill = Math.floor(totalPaise / pointRatePaise);
    const pointsToUse = Math.min(maxRedeemablePoints, maxPointsForBill);
    onUpdateRedeemPoints(pointsToUse);
  };

  return (
    <div className="fixed inset-0 bg-ink-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-5 shadow-pop space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div>
            <h3 className="font-bold text-base text-ink-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-brand-600" /> Payment & Settlement (F8)
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">Split across multiple payment modes or settle on credit</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon !h-7 !w-7"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-2.5 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Bill Total Banner */}
        <div className="bg-ink-50 rounded-xl p-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-600">Net Payable Amount</span>
          <span className="text-xl font-bold font-mono text-ink-900" data-testid="net-payable-amount">{formatINR(totalPaise)}</span>
        </div>

        {/* Loyalty Points Redemption (Task A2.7) */}
        {customer && maxRedeemablePoints > 0 && (
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Loyalty Points
              </span>
              <span className="text-xs font-mono text-amber-800">
                Avail: <strong>{maxRedeemablePoints} pts</strong> ({formatINR(customer.redeemableValuePaise ?? 0)})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max={maxRedeemablePoints}
                value={redeemPoints === 0 ? "" : redeemPoints}
                onChange={(e) => onUpdateRedeemPoints(Math.min(maxRedeemablePoints, parseInt(e.target.value, 10) || 0))}
                placeholder="Pts to redeem"
                className="input !py-1 text-xs font-mono font-bold flex-1"
              />
              <button
                type="button"
                onClick={handleSetMaxLoyalty}
                className="btn btn-secondary btn-sm !text-[11px] font-bold text-amber-800 border-amber-300 hover:bg-amber-100"
              >
                Redeem Max
              </button>
            </div>
            {currentLoyaltyDiscountPaise > 0 && (
              <div className="text-[11px] text-emerald-700 font-semibold flex justify-between">
                <span>Loyalty Discount Applied:</span>
                <span>-{formatINR(currentLoyaltyDiscountPaise)}</span>
              </div>
            )}
          </div>
        )}

        {/* Split Tender Inputs */}
        <div className="space-y-2.5">
          {/* Cash Input */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1 font-semibold text-ink-700">
              <span className="flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5 text-emerald-600" /> Cash (₹)
              </span>
              <button
                type="button"
                onClick={() => handleSetExact("cash")}
                className="text-brand-600 hover:text-brand-800 text-[11px] underline font-bold"
              >
                Exact Cash
              </button>
            </div>
            <input
              type="number"
              step="any"
              min="0"
              aria-label="Cash tender amount"
              value={splitPayments.cash}
              onChange={(e) => onUpdateSplit({ cash: e.target.value })}
              placeholder="0.00"
              className="input !py-1.5 font-mono text-sm font-bold"
              autoFocus
            />
          </div>

          {/* UPI Input */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1 font-semibold text-ink-700">
              <span className="flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-sky-600" /> UPI / QR (₹)
              </span>
              <button
                type="button"
                onClick={() => handleSetExact("upi")}
                className="text-brand-600 hover:text-brand-800 text-[11px] underline font-bold"
              >
                Exact UPI
              </button>
            </div>
            <input
              type="number"
              step="any"
              min="0"
              aria-label="UPI tender amount"
              value={splitPayments.upi}
              onChange={(e) => onUpdateSplit({ upi: e.target.value })}
              placeholder="0.00"
              className="input !py-1.5 font-mono text-sm font-bold"
            />
          </div>

          {/* Card Input */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1 font-semibold text-ink-700">
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-indigo-600" /> Debit / Credit Card (₹)
              </span>
              <button
                type="button"
                onClick={() => handleSetExact("card")}
                className="text-brand-600 hover:text-brand-800 text-[11px] underline font-bold"
              >
                Exact Card
              </button>
            </div>
            <input
              type="number"
              step="any"
              min="0"
              aria-label="Card tender amount"
              value={splitPayments.card}
              onChange={(e) => onUpdateSplit({ card: e.target.value })}
              placeholder="0.00"
              className="input !py-1.5 font-mono text-sm font-bold"
            />
          </div>
        </div>

        {/* Change / Balance Due Indicator */}
        <div className="border-t border-ink-100 pt-3 space-y-1.5 text-xs font-semibold">
          <div className="flex justify-between text-ink-600">
            <span>Total Tendered:</span>
            <span className="font-mono font-bold text-ink-900">{formatINR(totalTendered)}</span>
          </div>

          {changeDuePaise > 0 && (
            <div className="flex justify-between text-emerald-700 bg-emerald-50 p-2 rounded-lg font-bold">
              <span>Change to Return (Cash):</span>
              <span className="font-mono">{formatINR(changeDuePaise)}</span>
            </div>
          )}

          {remainingDuePaise > 0 && (
            <div className="flex justify-between text-amber-800 bg-amber-50 p-2 rounded-lg font-bold">
              <span>Customer Credit (Unpaid):</span>
              <span className="font-mono">{formatINR(remainingDuePaise)}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm"
          >
            Cancel (Esc)
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="btn btn-primary btn-sm px-4 font-bold"
          >
            {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Complete Sale (F10)
          </button>
        </div>
      </div>
    </div>
  );
}
