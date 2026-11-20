"use client";

import React, { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Upload,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  PackageCheck,
} from "lucide-react";
import { commitOcrStockUpdateAction } from "@/app/actions/stock";

export interface StockOcrRow {
  rowKey: string;
  medicineName: string;
  genericName: string;
  manufacturer: string;
  hsn: string;
  matchedMedicineId: string | null;
  matchedMedicineName: string | null;
  existingBatchId: string | null;
  currentQtyOnHand: number;
  status: "update_batch" | "new_batch" | "new_medicine";
  batchNo: string;
  expiryDate: string;
  unitsPerPack: number;
  qtyPacks: number;
  qtyLoose: number;
  ptrPaise: number;
  mrpPaise: number;
  saleRatePaise: number;
  gstRateBp: number;
}

export function StockOcrModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<StockOcrRow[]>([]);
  const [stockMode, setStockMode] = useState<"add" | "set">("add");
  const [createMissing, setCreateMissing] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const handleScanFile = async (file: File) => {
    setIsScanning(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/ocr/stock-sheet", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to scan stock sheet.");
        setRows([]);
      } else {
        setRows(data.rows || []);
        if (!data.rows || data.rows.length === 0) {
          setError("No medicine stock rows could be extracted from this file.");
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "OCR request failed.");
    } finally {
      setIsScanning(false);
    }
  };

  const updateRow = (idx: number, patch: Partial<StockOcrRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleCommit = () => {
    const invalid = rows.find((r) => !r.medicineName.trim() || !r.batchNo.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.expiryDate));
    if (invalid) {
      setError(`Row "${invalid.medicineName || "Unnamed"}" needs a valid batch number and expiry date (YYYY-MM-DD).`);
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await commitOcrStockUpdateAction({
        mode: stockMode,
        createMissingMedicines: createMissing,
        items: rows.map((r) => ({
          medicineId: r.matchedMedicineId,
          medicineName: r.medicineName,
          genericName: r.genericName || undefined,
          manufacturer: r.manufacturer || undefined,
          hsn: r.hsn || undefined,
          batchNo: r.batchNo,
          expiryDate: r.expiryDate,
          unitsPerPack: r.unitsPerPack,
          baseQty: r.qtyPacks * r.unitsPerPack + r.qtyLoose,
          ptrPaise: r.ptrPaise,
          mrpPaise: r.mrpPaise,
          saleRatePaise: r.saleRatePaise,
          gstRateBp: r.gstRateBp,
        })),
      });

      if (res?.data) {
        setSuccessMsg(`Updated ${res.data.updatedCount} stock batches successfully.`);
        router.refresh();
        setTimeout(() => {
          onClose();
        }, 900);
      } else {
        setError(res?.serverError || "Failed to commit OCR stock update.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-ink-200 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-ink-150 flex items-center justify-between bg-ink-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-ink-900 text-base">
                Scan PDF / Image for Stock Update (OCR)
              </h3>
              <p className="text-xs text-ink-500">
                Upload a stock sheet, shelf count photo, or distributor bill PDF to update batch quantities directly.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {rows.length === 0 && !isScanning && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) void handleScanFile(e.dataTransfer.files[0]);
              }}
              className="border-2 border-dashed border-ink-250 hover:border-brand-500 hover:bg-brand-50/20 rounded-2xl p-12 text-center cursor-pointer transition-all space-y-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) void handleScanFile(e.target.files[0]);
                  e.target.value = "";
                }}
              />
              <div className="w-14 h-14 mx-auto rounded-full bg-brand-50 flex items-center justify-center text-brand-600">
                <Upload className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-ink-900">
                Click to upload or drag &amp; drop PDF / Stock Photo
              </p>
              <p className="text-xs text-ink-500">
                Supports PDF, JPG, PNG, and WebP up to 10 MB
              </p>
            </div>
          )}

          {isScanning && (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 mx-auto text-brand-600 animate-spin" />
              <p className="text-sm font-medium text-ink-800">
                Reading medicine batches, expiries &amp; quantities with Gemini OCR…
              </p>
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-ink-50 p-3 rounded-xl border border-ink-150 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-ink-700">Stock Update Mode:</span>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="ocr-stock-mode"
                      checked={stockMode === "add"}
                      onChange={() => setStockMode("add")}
                    />
                    <span>Add to existing stock</span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="ocr-stock-mode"
                      checked={stockMode === "set"}
                      onChange={() => setStockMode("set")}
                    />
                    <span>Set exact stock count</span>
                  </label>
                </div>

                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createMissing}
                    onChange={(e) => setCreateMissing(e.target.checked)}
                  />
                  <span>Create missing medicines in catalog</span>
                </label>
              </div>

              <div className="overflow-x-auto border border-ink-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-ink-50 border-b border-ink-200 text-ink-600 font-semibold">
                    <tr>
                      <th className="p-2.5">Medicine</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Batch No</th>
                      <th className="p-2.5">Expiry (YYYY-MM-DD)</th>
                      <th className="p-2.5 text-right">Packs</th>
                      <th className="p-2.5 text-right">Loose</th>
                      <th className="p-2.5 text-right">MRP (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {rows.map((r, idx) => (
                      <tr key={r.rowKey}>
                        <td className="p-2.5 font-medium text-ink-900">
                          {r.matchedMedicineName || r.medicineName}
                          {r.existingBatchId && (
                            <div className="text-[10.5px] text-ink-500">Current: {r.currentQtyOnHand} units</div>
                          )}
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`badge !text-[10px] ${
                              r.status === "update_batch"
                                ? "badge-brand"
                                : r.status === "new_batch"
                                ? "badge-success"
                                : "badge-warning"
                            }`}
                          >
                            {r.status === "update_batch"
                              ? "Update Batch"
                              : r.status === "new_batch"
                              ? "New Batch"
                              : "New Medicine"}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={r.batchNo}
                            onChange={(e) => updateRow(idx, { batchNo: e.target.value.toUpperCase() })}
                            className="input input-sm !py-1 !px-2 w-28 font-mono"
                          />
                        </td>
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={r.expiryDate}
                            onChange={(e) => updateRow(idx, { expiryDate: e.target.value })}
                            placeholder="2027-12-31"
                            className="input input-sm !py-1 !px-2 w-28 font-mono"
                          />
                        </td>
                        <td className="p-2.5 text-right">
                          <input
                            type="number"
                            min={0}
                            value={r.qtyPacks}
                            onChange={(e) => updateRow(idx, { qtyPacks: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                            className="input input-sm !py-1 !px-2 w-16 text-right font-mono"
                          />
                        </td>
                        <td className="p-2.5 text-right">
                          <input
                            type="number"
                            min={0}
                            value={r.qtyLoose}
                            onChange={(e) => updateRow(idx, { qtyLoose: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                            className="input input-sm !py-1 !px-2 w-16 text-right font-mono"
                          />
                        </td>
                        <td className="p-2.5 text-right font-mono">
                          ₹{(r.mrpPaise / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-ink-150 bg-ink-50/50 flex justify-between items-center">
          <div>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => setRows([])}
                className="btn btn-secondary btn-sm text-xs"
              >
                Scan Another File
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm text-xs">
              Cancel
            </button>
            {rows.length > 0 && (
              <button
                type="button"
                disabled={isPending}
                onClick={handleCommit}
                className="btn btn-primary btn-sm text-xs inline-flex items-center gap-1.5"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5" />}
                {isPending ? "Updating Stock…" : `Commit ${rows.length} Stock Rows`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

