"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle, Loader2, PackageCheck, X } from "lucide-react";

interface ReceiveItemLine {
  id: string;
  medicineName: string;
  batchNo: string;
  qtyDispatched: number;
  receivedQty: number;
  qtyDamaged: number;
  qtyShortage: number;
}

interface ReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    items: {
      itemId: string;
      qtyReceived: number;
      qtyDamaged: number;
      qtyShortage: number;
      discrepancyReason?: string;
    }[];
    notes?: string;
    idempotencyKey: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  items: ReceiveItemLine[];
}

export function ReceiveModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  items,
}: ReceiveModalProps) {
  // Initialize state with remaining unaccounted quantities
  const [lineStates, setLineStates] = useState(() =>
    items.map((i) => {
      const remaining = Math.max(0, i.qtyDispatched - (i.receivedQty + i.qtyDamaged + i.qtyShortage));
      return {
        itemId: i.id,
        medicineName: i.medicineName,
        batchNo: i.batchNo,
        remaining,
        qtyReceived: remaining,
        qtyDamaged: 0,
        qtyShortage: 0,
        discrepancyReason: "",
      };
    }),
  );

  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleQtyChange = (
    itemId: string,
    field: "qtyReceived" | "qtyDamaged" | "qtyShortage",
    val: number,
  ) => {
    setLineStates((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, [field]: Math.max(0, val) } : l)),
    );
  };

  const handleReasonChange = (itemId: string, val: string) => {
    setLineStates((prev) =>
      prev.map((l) => (l.itemId === itemId ? { ...l, discrepancyReason: val } : l)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    for (const l of lineStates) {
      const lineTotal = l.qtyReceived + l.qtyDamaged + l.qtyShortage;
      if (lineTotal > l.remaining) {
        setError(
          `Total receipt (${lineTotal}) exceeds remaining quantity (${l.remaining}) for ${l.medicineName} (Batch ${l.batchNo})`,
        );
        return;
      }
      if ((l.qtyDamaged > 0 || l.qtyShortage > 0) && !l.discrepancyReason.trim()) {
        setError(
          `Please provide a discrepancy reason for damaged/short items on ${l.medicineName}`,
        );
        return;
      }
    }

    const activeLines = lineStates.filter(
      (l) => l.qtyReceived + l.qtyDamaged + l.qtyShortage > 0,
    );

    if (activeLines.length === 0) {
      setError("Please specify quantities to receive for at least one item.");
      return;
    }

    const idempotencyKey = crypto.randomUUID();

    await onConfirm({
      items: activeLines.map((l) => ({
        itemId: l.itemId,
        qtyReceived: l.qtyReceived,
        qtyDamaged: l.qtyDamaged,
        qtyShortage: l.qtyShortage,
        discrepancyReason: l.discrepancyReason.trim() || undefined,
      })),
      notes: notes.trim() || undefined,
      idempotencyKey,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-ink-950/40 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-2xl rounded-xl border border-ink-200 bg-white p-6 shadow-2xl transition-all max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <PackageCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-900">Receive Stock Transfer</h2>
              <p className="text-xs text-ink-500">
                Accept incoming inventory, record transit damages or shortages.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto flex-1 pr-1">
          <div className="space-y-3">
            {lineStates.map((line) => (
              <div
                key={line.itemId}
                className="rounded-lg border border-ink-200 p-3 bg-ink-50/30 space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-ink-900">{line.medicineName}</p>
                    <p className="text-[11px] text-ink-500">
                      Batch: <span className="font-mono">{line.batchNo}</span> | Remaining to Receive:{" "}
                      <span className="font-semibold text-ink-800">{line.remaining}</span>
                    </p>
                  </div>
                  <span className="text-[11px] font-medium text-ink-600">
                    Total: {line.qtyReceived + line.qtyDamaged + line.qtyShortage} / {line.remaining}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-emerald-700 mb-0.5">
                      Accepted Qty
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={line.remaining}
                      value={line.qtyReceived}
                      onChange={(e) =>
                        handleQtyChange(line.itemId, "qtyReceived", parseInt(e.target.value) || 0)
                      }
                      className="w-full rounded border border-ink-200 bg-white p-1.5 text-center text-xs font-medium focus:border-brand-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-amber-700 mb-0.5">
                      Damaged Qty
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={line.remaining}
                      value={line.qtyDamaged}
                      onChange={(e) =>
                        handleQtyChange(line.itemId, "qtyDamaged", parseInt(e.target.value) || 0)
                      }
                      className="w-full rounded border border-ink-200 bg-white p-1.5 text-center text-xs font-medium focus:border-brand-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-rose-700 mb-0.5">
                      Shortage Qty
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={line.remaining}
                      value={line.qtyShortage}
                      onChange={(e) =>
                        handleQtyChange(line.itemId, "qtyShortage", parseInt(e.target.value) || 0)
                      }
                      className="w-full rounded border border-ink-200 bg-white p-1.5 text-center text-xs font-medium focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                </div>

                {(line.qtyDamaged > 0 || line.qtyShortage > 0) && (
                  <div>
                    <label className="block text-[11px] font-medium text-ink-700 mb-0.5">
                      Discrepancy Reason *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Broken ampoules in shipment or missing seal"
                      value={line.discrepancyReason}
                      onChange={(e) => handleReasonChange(line.itemId, e.target.value)}
                      className="w-full rounded border border-ink-200 bg-white p-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
                      required
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">Receipt Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Delivery received in good order except damaged box #2"
              className="w-full rounded-lg border border-ink-200 p-2 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-ink-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-ink-200 px-3.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5" />
              )}
              Accept Stock
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
