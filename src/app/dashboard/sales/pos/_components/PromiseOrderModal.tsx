"use client";

import { useState, type FormEvent } from "react";
import { BookmarkCheck, X, Loader2 } from "lucide-react";
import type { PosDataSource } from "../_data/posData";

interface PromiseOrderModalProps {
  isOpen: boolean;
  medicine: { id: string; name: string } | null;
  defaultCustomerName?: string;
  defaultCustomerPhone?: string;
  dataSource: PosDataSource;
  onSuccess: (message: string) => void;
  onClose: () => void;
}

export function PromiseOrderModal({
  isOpen,
  medicine,
  defaultCustomerName = "",
  defaultCustomerPhone = "",
  dataSource,
  onSuccess,
  onClose,
}: PromiseOrderModalProps) {
  const [customerName, setCustomerName] = useState(defaultCustomerName);
  const [customerPhone, setCustomerPhone] = useState(defaultCustomerPhone);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!isOpen || !medicine) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      setErrorMsg("Customer name and phone number are required");
      return;
    }
    setIsSaving(true);
    setErrorMsg("");

    try {
      const res = await dataSource.createPromiseOrder({
        medicineId: medicine.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        qtyRequested: quantity,
        notes: notes.trim() || undefined,
      });
      if (res?.error) {
        setErrorMsg(res.error);
        return;
      }
      onSuccess(`Promise order recorded for ${customerName}`);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save promise order");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ink-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-sm p-5 shadow-pop space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div>
            <h3 className="font-bold text-base text-ink-900 flex items-center gap-2">
              <BookmarkCheck className="w-5 h-5 text-amber-600" /> Promise Order (F9)
            </h3>
            <p className="text-xs text-ink-500 mt-0.5">Record customer demand for out-of-stock item</p>
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
          <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-2 rounded-lg">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-ink-600">Medicine</label>
            <div className="input !py-1.5 text-xs bg-ink-50 font-bold text-ink-900 mt-0.5">
              {medicine.name}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Patient Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Name"
                className="input !py-1 text-xs mt-0.5"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Mobile Phone *</label>
              <input
                type="tel"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="10 digits"
                className="input !py-1 text-xs mt-0.5 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Quantity Needed</label>
              <input
                type="number"
                min="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                className="input !py-1 text-xs mt-0.5 font-bold font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-600">Notes / Priority</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Urgent, by tomorrow"
                className="input !py-1 text-xs mt-0.5"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-ink-100">
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
              Cancel (Esc)
            </button>
            <button type="submit" disabled={isSaving} className="btn btn-primary btn-sm px-3 font-bold">
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              Save Promise Order
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
