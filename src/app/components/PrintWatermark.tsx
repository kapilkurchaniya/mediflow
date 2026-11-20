import React from "react";

/**
 * Subtle diagonal "MediFlow" watermark rendered strictly in print / Save-as-PDF
 * mode on reports and A4 documents (never on 80mm thermal slips or screen UI).
 */
export function PrintWatermark({ label = "MediFlow" }: { label?: string }) {
  return (
    <div
      aria-hidden="true"
      className="hidden print:flex pointer-events-none fixed inset-0 z-[9999] items-center justify-center overflow-hidden select-none"
    >
      <div className="grid grid-cols-2 gap-x-24 gap-y-32 -rotate-30 opacity-[0.06]">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="text-center whitespace-nowrap">
            <div className="text-5xl font-extrabold tracking-[0.18em] uppercase text-ink-900">
              {label}
            </div>
            <div className="text-[10px] font-semibold tracking-[0.28em] uppercase text-ink-700 mt-1">
              MediFlow Pharmacy ERP
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

