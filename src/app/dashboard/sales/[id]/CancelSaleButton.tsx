"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, AlertTriangle, Loader2, X, CheckCircle2 } from "lucide-react";
import { cancelSaleAction } from "@/app/actions/sales";

interface CancelSaleButtonProps {
  saleId: string;
  invoiceNo: string | null;
  isSameDay: boolean;
  canCancel: boolean;
  hasReturns: boolean;
}

export function CancelSaleButton({
  saleId,
  invoiceNo,
  isSameDay,
  canCancel,
  hasReturns,
}: CancelSaleButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Keyboard accessibility: Esc to close modal, Alt + C to open if allowed
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setError(null);
      } else if (
        (e.altKey && (e.key === "c" || e.key === "C")) &&
        !isOpen &&
        canCancel &&
        isSameDay &&
        !hasReturns
      ) {
        // Alt + C keyboard shortcut to trigger bill cancellation modal
        e.preventDefault();
        setIsOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, canCancel, isSameDay, hasReturns]);

  if (!canCancel) {
    return null;
  }

  const disabledReason = !isSameDay
    ? "Cancellation is only permitted on the same business day (Asia/Kolkata). For older sales, please process a Sale Return / Credit Note."
    : hasReturns
    ? "This bill has partial returns recorded. Cannot cancel directly; please issue a credit note for remaining items."
    : null;

  function handleOpen() {
    if (disabledReason) return;
    setError(null);
    setReason("");
    setIsOpen(true);
  }

  function handleConfirm() {
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError("Please provide a valid cancellation reason (at least 3 characters).");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await cancelSaleAction(saleId, trimmed);
      if (res.success) {
        setIsOpen(false);
        router.refresh();
      } else {
        setError(res.error || "Failed to cancel sale bill.");
      }
    });
  }

  return (
    <>
      <div className="relative inline-block group">
        <button
          type="button"
          onClick={handleOpen}
          disabled={Boolean(disabledReason)}
          className={`btn text-[13px] font-medium transition-colors ${
            disabledReason
              ? "opacity-50 cursor-not-allowed bg-ink-100 text-ink-400 border border-ink-200"
              : "border border-rose-300 text-rose-700 bg-white hover:bg-rose-50 hover:border-rose-400 shadow-xs"
          }`}
          title={disabledReason ?? "Cancel this sale bill (Alt + C)"}
        >
          <Ban className="h-4 w-4 mr-1.5 text-rose-600" />
          <span>Cancel Bill</span>
          {!disabledReason && (
            <span className="hidden sm:inline-block ml-1.5 text-[10.5px] px-1 py-0.2 bg-rose-100/70 text-rose-800 rounded font-mono">
              Alt+C
            </span>
          )}
        </button>

        {disabledReason && (
          <div className="absolute right-0 top-full mt-1.5 z-20 hidden group-hover:block w-72 p-2.5 bg-ink-900 text-white text-[12px] rounded-lg shadow-lg">
            {disabledReason}
          </div>
        )}
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-bill-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/45 backdrop-blur-xs animate-fade"
          onClick={() => !isPending && setIsOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border border-ink-150 bg-white shadow-2xl animate-enter"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50/70 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-rose-100 text-rose-700">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <h2
                    id="cancel-bill-title"
                    className="text-[15px] font-bold text-ink-900 leading-tight"
                  >
                    Cancel Invoice {invoiceNo || ""}
                  </h2>
                  <p className="text-[12px] text-ink-600 mt-0.5">
                    Permanent cancellation & statutory compliance reversal
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isPending && setIsOpen(false)}
                disabled={isPending}
                className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600 transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              {/* Compliance Impact Info */}
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 space-y-2 text-[12.5px] text-amber-900">
                <div className="font-semibold text-amber-800 flex items-center gap-1.5">
                  <span>Upon confirmation, the system will automatically:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-ink-700 text-[12px] pl-1">
                  <li>
                    Restore medicine stock to the <strong>exact batch numbers</strong> (traceable <code>sale_return</code> movement)
                  </li>
                  <li>
                    Post a reversing double-entry journal entry (debits &amp; credits mirrored to 0 paise)
                  </li>
                  <li>
                    Void the outward GST invoice in GSTR-1 (invoice number remains reported under cancelled documents)
                  </li>
                  <li>
                    Annotate statutory Schedule H / H1 / X dispensing registers with your reason
                  </li>
                  <li>
                    Reverse any customer loyalty points and outstanding credit
                  </li>
                </ul>
              </div>

              {/* Reason Input */}
              <div className="space-y-1.5">
                <label
                  htmlFor="cancel-reason"
                  className="block text-[13px] font-semibold text-ink-800"
                >
                  Reason for Cancellation <span className="text-rose-600">*</span>
                </label>
                <textarea
                  id="cancel-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={isPending}
                  placeholder="e.g. Customer cancelled before leaving counter, wrong doctor details entered, duplicate bill entry..."
                  className="w-full text-[13px] p-2.5 rounded-lg border border-ink-250 focus:border-rose-500 focus:ring-2 focus:ring-rose-200 outline-none transition"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleConfirm();
                    }
                  }}
                />
                <p className="text-[11.5px] text-ink-500">
                  Mandatory audit requirement under Drug &amp; Cosmetics and GST rules. Minimum 3 characters.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12.5px] font-medium text-rose-800 animate-fade">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-ink-150 bg-ink-50/70 px-5 py-3 flex items-center justify-between">
              <span className="text-[12px] text-ink-500 hidden sm:inline">
                Press <kbd className="kbd text-[10px]">Esc</kbd> to dismiss
              </span>
              <div className="flex items-center gap-2.5 ml-auto">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                  className="btn btn-secondary text-[13px]"
                >
                  Keep Bill
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isPending || reason.trim().length < 3}
                  className="btn btn-danger text-[13px] bg-rose-600 hover:bg-rose-700 text-white font-medium shadow-xs"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Cancelling Bill...
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4 mr-1.5" />
                      Confirm Cancellation
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
