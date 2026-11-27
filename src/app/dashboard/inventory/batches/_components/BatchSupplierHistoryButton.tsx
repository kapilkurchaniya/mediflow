"use client";

import { useState } from "react";
import { History, X } from "lucide-react";
import { MedicineSupplierHistoryPanel } from "@/app/components/MedicineSupplierHistoryPanel";

export function BatchSupplierHistoryButton({
  medicineId,
  medicineName,
}: {
  medicineId: string;
  medicineName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-1.5 rounded text-ink-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
        title="Compare past supplier purchases & schemes"
        aria-label={`Compare suppliers for ${medicineName}`}
      >
        <History className="w-4 h-4" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-ink-200 w-full max-w-3xl max-h-[85vh] overflow-y-auto p-5 space-y-3 text-left">
            <div className="flex items-center justify-between border-b border-ink-150 pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink-900">Supplier Purchase Comparison</h3>
                <p className="text-xs text-ink-500">{medicineName}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-ink-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <MedicineSupplierHistoryPanel medicineId={medicineId} medicineName={medicineName} />
          </div>
        </div>
      )}
    </>
  );
}
