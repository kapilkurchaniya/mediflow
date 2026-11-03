"use client";

import { formatINR } from "@/lib/format";

interface MobileTenderBarProps {
  itemCount: number;
  totalPaise: number;
  isSubmitting: boolean;
  canBill: boolean;
  onHold: () => void;
  onOpenPayment: () => void;
}

export function MobileTenderBar({
  itemCount,
  totalPaise,
  isSubmitting,
  canBill,
  onHold,
  onOpenPayment,
}: MobileTenderBarProps) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-ink-200 px-4 py-3 shadow-pop flex items-center justify-between">
      <div className="flex flex-col">
        <span className="text-[11px] font-medium text-ink-500 uppercase tracking-wider">
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>
        <span className="text-lg font-bold font-mono text-ink-950">
          {formatINR(totalPaise / 100)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {itemCount > 0 && (
          <button
            type="button"
            onClick={onHold}
            className="btn btn-secondary px-3 py-2 text-xs font-semibold"
          >
            Hold
          </button>
        )}
        <button
          type="button"
          disabled={itemCount === 0 || isSubmitting || !canBill}
          onClick={onOpenPayment}
          className="btn btn-primary px-4 py-2 text-xs sm:text-sm font-bold shadow-md active:scale-95 flex items-center gap-1.5"
        >
          {isSubmitting ? "Processing..." : "Tender & Pay (F8)"}
        </button>
      </div>
    </div>
  );
}
