"use client";

import { useState } from "react";
import { Edit2, X, Check, Loader2, AlertCircle } from "lucide-react";
import { updateBatch } from "@/app/actions/stock";
import { useRouter } from "next/navigation";

export interface BatchEditData {
  id: string;
  batchNo: string;
  expiryDate: string;
  purchaseRate: number; // in paise
  mrp: number; // in paise
  saleRate: number; // in paise
  medicineName: string;
}

export function EditBatchButton({ batch }: { batch: BatchEditData }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [batchNo, setBatchNo] = useState(batch.batchNo);
  const [expiryDate, setExpiryDate] = useState(batch.expiryDate);
  const [purchaseRate, setPurchaseRate] = useState(
    batch.purchaseRate > 0 ? (batch.purchaseRate / 100).toFixed(2) : batch.mrp > 0 ? ((batch.mrp * 0.8) / 100).toFixed(2) : "0.00"
  );
  const [mrp, setMrp] = useState(((batch.mrp || 0) / 100).toFixed(2));
  const [saleRate, setSaleRate] = useState(((batch.saleRate || batch.mrp || 0) / 100).toFixed(2));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("batchId", batch.id);
    formData.append("batchNo", batchNo);
    formData.append("expiryDate", expiryDate);
    formData.append("purchaseRate", purchaseRate);
    formData.append("mrp", mrp);
    formData.append("saleRate", saleRate);

    try {
      const res = await updateBatch(formData);
      if (res.error) {
        setError(res.error);
        setIsSubmitting(false);
      } else {
        setIsOpen(false);
        setIsSubmitting(false);
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update batch");
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="btn btn-ghost !p-1.5 text-ink-500 hover:text-ink-900"
        title="Edit batch PTR, MRP, or expiry"
        aria-label="Edit batch"
      >
        <Edit2 className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="card w-full max-w-lg shadow-xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-ink-150 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-ink-900">Edit Batch</h3>
                <p className="text-[12.5px] text-ink-500">{batch.medicineName}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-5 space-y-4">
                {error && (
                  <div className="alert-error text-[12.5px]">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label" htmlFor="edit-batchNo">Batch Number</label>
                    <input
                      id="edit-batchNo"
                      required
                      value={batchNo}
                      onChange={(e) => setBatchNo(e.target.value.toUpperCase())}
                      className="input font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="edit-expiry">Expiry Date</label>
                    <input
                      id="edit-expiry"
                      type="date"
                      required
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="input num"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label" htmlFor="edit-ptr">Purchase Rate (PTR)</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-[12px]">₹</span>
                      <input
                        id="edit-ptr"
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={purchaseRate}
                        onChange={(e) => setPurchaseRate(e.target.value)}
                        className="input pl-6 num"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="edit-mrp">MRP</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-[12px]">₹</span>
                      <input
                        id="edit-mrp"
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={mrp}
                        onChange={(e) => setMrp(e.target.value)}
                        className="input pl-6 num"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="edit-salerate">Sale Rate</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400 text-[12px]">₹</span>
                      <input
                        id="edit-salerate"
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={saleRate}
                        onChange={(e) => setSaleRate(e.target.value)}
                        className="input pl-6 num"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-ink-150 bg-ink-50/70 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="btn btn-ghost btn-sm"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary btn-sm"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Saving…
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1.5" /> Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

