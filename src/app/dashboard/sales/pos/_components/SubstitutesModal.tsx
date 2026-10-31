"use client";

import { useState, useEffect } from "react";
import { Sparkles, X, Loader2, PackageX } from "lucide-react";
import { formatINR } from "@/lib/format";
import type { PosDataSource, SubstituteItem, SearchResultBatch, SearchResultMedicine } from "../_data/posData";

interface SubstitutesModalProps {
  isOpen: boolean;
  genericName: string;
  dataSource: PosDataSource;
  onSelectSubstitute: (medicine: SearchResultMedicine, batch: SearchResultBatch, allBatches: SearchResultBatch[]) => void;
  onClose: () => void;
}

export function SubstitutesModal({
  isOpen,
  genericName,
  dataSource,
  onSelectSubstitute,
  onClose,
}: SubstitutesModalProps) {
  const [items, setItems] = useState<SubstituteItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!isOpen || !genericName.trim()) return;

    async function fetchSubs() {
      setIsLoading(true);
      try {
        const subs = await dataSource.findSubstitutes(genericName);
        if (active) setItems(subs);
      } catch (err) {
        console.error("Error loading substitutes:", err);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    fetchSubs();
    return () => {
      active = false;
    };
  }, [isOpen, genericName, dataSource]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-ink-950/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-xl p-5 shadow-pop space-y-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div>
            <h3 className="font-bold text-base text-ink-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-600" /> Substitute Medicine Finder (F3)
            </h3>
            <p className="text-xs text-ink-500 font-mono mt-0.5">
              Generic salt: <span className="font-semibold text-brand-700">{genericName}</span>
            </p>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-8 text-ink-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
              <span className="text-xs">Finding available therapeutic alternatives...</span>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center p-8 text-ink-400 space-y-2">
              <PackageX className="w-8 h-8 mx-auto text-ink-300" />
              <p className="font-semibold text-ink-700 text-xs">No in-stock substitutes found</p>
              <p className="text-[11px] text-ink-400">
                There are no other medicines with salt &ldquo;{genericName}&rdquo; available in your inventory.
              </p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Brand Name</th>
                  <th>Batch / Expiry</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const firstBatch = item.batches[0];
                  if (!firstBatch) return null;
                  return (
                    <tr key={item.medicine.id}>
                      <td>
                        <div className="font-semibold text-ink-900 text-xs">{item.medicine.name}</div>
                        <div className="text-[11px] text-ink-500 font-mono">
                          {item.medicine.genericName}
                        </div>
                      </td>
                      <td>
                        <div className="font-mono text-xs font-semibold text-ink-800">
                          {firstBatch.batchNo}
                        </div>
                        <div className="text-[10.5px] text-ink-500 font-mono">
                          Exp: {firstBatch.expiryDate}
                        </div>
                      </td>
                      <td className="text-right">
                        <span className="font-mono font-bold text-xs text-ink-900">
                          {item.totalStock}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="font-mono font-bold text-xs text-emerald-700">
                          {formatINR(firstBatch.saleRate ?? firstBatch.mrp)}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectSubstitute(item.medicine, firstBatch, item.batches);
                            onClose();
                          }}
                          className="btn btn-secondary btn-sm !text-xs font-semibold hover:!bg-brand-600 hover:!text-white"
                        >
                          + Select
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-ink-100">
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
