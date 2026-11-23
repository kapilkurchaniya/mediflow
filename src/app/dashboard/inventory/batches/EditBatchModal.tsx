"use client";

import { useState } from "react";
import { Edit2, X, Check, Loader2, AlertCircle } from "lucide-react";
import { updateBatch } from "@/app/actions/stock";
import { useRouter } from "next/navigation";

export interface BatchEditData {
  id: string;
  batchNo: string;
  expiryDate: string;
  purchaseRate: number; // in paise per base unit
  mrp: number; // in paise per pack
  saleRate: number; // in paise per pack
  qtyOnHand: number;
  status: string;
  medicineName: string;
  unitsPerPack?: number;
  packUnit?: string;
  looseUnit?: string;
}

export function EditBatchButton({ batch }: { batch: BatchEditData }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upp = Math.max(1, batch.unitsPerPack ?? 1);
  const packUnit = batch.packUnit || "strip";
  const looseUnit = batch.looseUnit || "tablet";

  const [batchNo, setBatchNo] = useState(batch.batchNo);
  const [expiryDate, setExpiryDate] = useState(batch.expiryDate);
  const [status, setStatus] = useState<"active" | "hold">(batch.status === "hold" ? "hold" : "active");
  const [purchaseRate, setPurchaseRate] = useState(
    batch.purchaseRate > 0 ? (batch.purchaseRate / 100).toFixed(2) : batch.mrp > 0 ? ((batch.mrp * 0.8) / 100 / upp).toFixed(2) : "0.00"
  );
  const [mrp, setMrp] = useState(((batch.mrp || 0) / 100).toFixed(2));
  const [saleRate, setSaleRate] = useState(((batch.saleRate || batch.mrp || 0) / 100).toFixed(2));

  const [stockMode, setStockMode] = useState<"keep" | "set" | "adjust">("keep");
  const [setPacks, setSetPacks] = useState(String(Math.floor(batch.qtyOnHand / upp)));
  const [setLoose, setSetLoose] = useState(String(batch.qtyOnHand % upp));
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState<"adjustment" | "damage" | "expired">("adjustment");
  const [adjustNote, setAdjustNote] = useState("");

  const handleOpen = () => {
    setBatchNo(batch.batchNo);
    setExpiryDate(batch.expiryDate);
    setStatus(batch.status === "hold" ? "hold" : "active");
    setPurchaseRate(
      batch.purchaseRate > 0 ? (batch.purchaseRate / 100).toFixed(2) : batch.mrp > 0 ? ((batch.mrp * 0.8) / 100 / upp).toFixed(2) : "0.00"
    );
    setMrp(((batch.mrp || 0) / 100).toFixed(2));
    setSaleRate(((batch.saleRate || batch.mrp || 0) / 100).toFixed(2));
    setStockMode("keep");
    setSetPacks(String(Math.floor(batch.qtyOnHand / upp)));
    setSetLoose(String(batch.qtyOnHand % upp));
    setAdjustDelta("");
    setAdjustReason("adjustment");
    setAdjustNote("");
    setError(null);
    setIsOpen(true);
  };

  const targetBaseQty =
    upp > 1
      ? Math.max(0, (parseInt(setPacks || "0", 10) || 0) * upp + (parseInt(setLoose || "0", 10) || 0))
      : Math.max(0, parseInt(setPacks || "0", 10) || 0);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData();
    formData.append("batchId", batch.id);
    formData.append("batchNo", batchNo);
    formData.append("expiryDate", expiryDate);
    formData.append("status", status);
    formData.append("purchaseRate", purchaseRate);
    formData.append("mrp", mrp);
    formData.append("saleRate", saleRate);
    formData.append("stockMode", stockMode);
    if (stockMode === "set") {
      formData.append("targetQty", String(targetBaseQty));
    } else if (stockMode === "adjust") {
      const deltaNum = parseInt(adjustDelta || "0", 10) || 0;
      formData.append("qtyDelta", String(deltaNum));
    }
    if (stockMode !== "keep") {
      formData.append("adjustReason", adjustReason);
      formData.append("adjustNote", adjustNote);
    }

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
        type="button"
        onClick={handleOpen}
        className="btn btn-ghost !p-1.5 text-ink-500 hover:text-ink-900"
        title="Edit batch PTR, MRP, expiry, or stock quantity"
        data-tooltip-title="Edit Batch & Stock"
        data-tooltip="Edit batch number, expiry, rates, hold status, or adjust stock quantity"
        aria-label="Edit batch"
      >
        <Edit2 className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150 text-left">
          <div className="card w-full max-w-xl max-h-[92vh] flex flex-col shadow-xl animate-in zoom-in-95 duration-150 overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-150 px-5 py-4 shrink-0">
              <div>
                <h3 className="text-base font-semibold text-ink-900">Edit Batch &amp; Stock</h3>
                <p className="text-[12.5px] text-ink-500">
                  {batch.medicineName}
                  {upp > 1 ? ` · 1 ${packUnit} = ${upp} ${looseUnit}s` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
              <div className="p-5 space-y-4 overflow-y-auto flex-1">
                {error && (
                  <div className="alert-error text-[12.5px]">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-3">
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
                  <div>
                    <label className="label" htmlFor="edit-status">Status</label>
                    <select
                      id="edit-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value === "hold" ? "hold" : "active")}
                      className="input"
                    >
                      <option value="active">Active (Sellable)</option>
                      <option value="hold">Hold (Blocked in POS)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label" htmlFor="edit-ptr">
                      PTR / {upp > 1 ? looseUnit : "unit"}
                    </label>
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
                    <label className="label" htmlFor="edit-mrp">
                      MRP / {packUnit}
                    </label>
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
                    <label className="label" htmlFor="edit-salerate">
                      Sale Rate / {packUnit}
                    </label>
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

                {/* Stock Quantity Adjustment */}
                <div className="rounded-xl border border-ink-200 bg-ink-50/60 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-ink-800">Stock Quantity (Ledger Audited)</div>
                      <div className="text-[11.5px] text-ink-500 font-mono">
                        Current on hand:{" "}
                        {upp > 1
                          ? `${Math.floor(batch.qtyOnHand / upp)} ${packUnit}s + ${batch.qtyOnHand % upp} ${looseUnit}s (${batch.qtyOnHand} total)`
                          : `${batch.qtyOnHand} ${looseUnit}s`}
                      </div>
                    </div>
                    <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5 text-xs">
                      {(["keep", "set", "adjust"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setStockMode(m)}
                          className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                            stockMode === m ? "bg-brand-600 text-white" : "text-ink-600 hover:text-ink-900"
                          }`}
                        >
                          {m === "keep" ? "Unchanged" : m === "set" ? "Set exact" : "Adjust (+/-)"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {stockMode === "set" && (
                    <div className="grid grid-cols-2 gap-3">
                      {upp > 1 ? (
                        <>
                          <div>
                            <label className="label capitalize" htmlFor="edit-set-packs">{packUnit}s</label>
                            <input
                              id="edit-set-packs"
                              type="number"
                              min={0}
                              value={setPacks}
                              onChange={(e) => setSetPacks(e.target.value)}
                              className="input num"
                            />
                          </div>
                          <div>
                            <label className="label capitalize" htmlFor="edit-set-loose">Loose {looseUnit}s</label>
                            <input
                              id="edit-set-loose"
                              type="number"
                              min={0}
                              value={setLoose}
                              onChange={(e) => setSetLoose(e.target.value)}
                              className="input num"
                            />
                          </div>
                        </>
                      ) : (
                        <div className="col-span-2">
                          <label className="label" htmlFor="edit-set-units">Exact Units on Hand</label>
                          <input
                            id="edit-set-units"
                            type="number"
                            min={0}
                            value={setPacks}
                            onChange={(e) => setSetPacks(e.target.value)}
                            className="input num"
                          />
                        </div>
                      )}
                      <div className="col-span-2 text-[11px] font-mono text-ink-600">
                        New total: <strong>{targetBaseQty}</strong> {looseUnit}s (change:{" "}
                        {targetBaseQty - batch.qtyOnHand >= 0 ? "+" : ""}
                        {targetBaseQty - batch.qtyOnHand})
                      </div>
                    </div>
                  )}

                  {stockMode === "adjust" && (
                    <div>
                      <label className="label" htmlFor="edit-qty-delta">
                        Quantity Change ({looseUnit}s, e.g. +10 or -5)
                      </label>
                      <input
                        id="edit-qty-delta"
                        type="number"
                        value={adjustDelta}
                        onChange={(e) => setAdjustDelta(e.target.value)}
                        className="input num"
                        placeholder="-2 or +10"
                      />
                    </div>
                  )}

                  {stockMode !== "keep" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label" htmlFor="edit-adj-reason">Reason</label>
                        <select
                          id="edit-adj-reason"
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value as "adjustment" | "damage" | "expired")}
                          className="input"
                        >
                          <option value="adjustment">Physical count / correction</option>
                          <option value="damage">Damaged / broken</option>
                          <option value="expired">Expired write-off</option>
                        </select>
                      </div>
                      <div>
                        <label className="label" htmlFor="edit-adj-note">Note (optional)</label>
                        <input
                          id="edit-adj-note"
                          value={adjustNote}
                          onChange={(e) => setAdjustNote(e.target.value)}
                          className="input"
                          placeholder="Reason for audit log"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-ink-150 bg-ink-50/70 px-5 py-3 shrink-0">
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
                  {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
