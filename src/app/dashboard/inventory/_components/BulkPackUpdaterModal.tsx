"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, X, Check, Loader2, AlertCircle, Info } from "lucide-react";
import { bulkUpdateMedicinePackaging } from "@/app/actions/inventory";

export interface BulkPackItem {
  id: string;
  name: string;
  genericName: string | null;
  unitsPerPack: number;
  packUnit: string;
  looseUnit: string;
  packSize: string | null;
  stockUnits: number;
}

interface RowDraft {
  id: string;
  unitsPerPack: number;
  packUnit: string;
  looseUnit: string;
}

export function BulkPackUpdaterModal({
  items,
  canAdjustStock,
}: {
  items: BulkPackItem[];
  canAdjustStock: boolean;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [onlySingleUnit, setOnlySingleUnit] = useState(true);
  const [convertExistingBatches, setConvertExistingBatches] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const singleUnitCount = items.filter((i) => i.unitsPerPack === 1).length;

  const handleOpen = () => {
    const initial: Record<string, RowDraft> = {};
    for (const item of items) {
      initial[item.id] = {
        id: item.id,
        unitsPerPack: item.unitsPerPack || 1,
        packUnit: item.packUnit || "strip",
        looseUnit: item.looseUnit || "tablet",
      };
    }
    setDrafts(initial);
    setOnlySingleUnit(singleUnitCount > 0);
    setConvertExistingBatches(false);
    setError(null);
    setSuccessMsg(null);
    setIsOpen(true);
  };

  const visibleItems = onlySingleUnit
    ? items.filter((i) => i.unitsPerPack === 1)
    : items;

  const changedItems = visibleItems.filter((item) => {
    const d = drafts[item.id];
    if (!d) return false;
    return (
      d.unitsPerPack !== item.unitsPerPack ||
      d.packUnit !== (item.packUnit || "strip") ||
      d.looseUnit !== (item.looseUnit || "tablet")
    );
  });

  const updateDraft = (id: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const applyAllUpp = (upp: number) => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const item of visibleItems) {
        next[item.id] = {
          ...(next[item.id] ?? {
            id: item.id,
            unitsPerPack: item.unitsPerPack || 1,
            packUnit: item.packUnit || "strip",
            looseUnit: item.looseUnit || "tablet",
          }),
          unitsPerPack: upp,
          packUnit: "strip",
          looseUnit: next[item.id]?.looseUnit === "capsule" ? "capsule" : "tablet",
        };
      }
      return next;
    });
  };

  const handleSave = () => {
    if (changedItems.length === 0) return;
    setError(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await bulkUpdateMedicinePackaging({
        convertExistingBatches,
        items: changedItems.map((item) => {
          const d = drafts[item.id];
          return {
            medicineId: item.id,
            unitsPerPack: Math.max(1, d.unitsPerPack),
            packUnit: d.packUnit || "strip",
            looseUnit: d.looseUnit || "tablet",
            packSize: `${Math.max(1, d.unitsPerPack)}'s`,
          };
        }),
      });

      if (!("success" in res) || !res.success) {
        setError(res.error || "Failed to update pack sizes.");
      } else {
        setSuccessMsg(
          `Updated ${res.updatedMedicines} medicine(s)${
            res.convertedBatches ? ` and converted ${res.convertedBatches} batch(es)` : ""
          }.`
        );
        router.refresh();
        setTimeout(() => setIsOpen(false), 750);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="btn btn-secondary"
        data-tooltip-title="Bulk Set Pack Sizes"
        data-tooltip="Configure tablets per strip (Units/Pack) across multiple medicines at once"
      >
        <Layers className="w-4 h-4" />
        Bulk Set Pack Sizes
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white border border-ink-200 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-ink-150 flex items-center justify-between bg-ink-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-ink-900 text-base">
                    Bulk Set Pack Sizes (Loose Tablet Setup)
                  </h3>
                  <p className="text-xs text-ink-500">
                    Define how many tablets/capsules are in 1 strip so POS loose billing and purchasing work accurately.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="btn btn-ghost btn-icon"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200 bg-ink-50/60 p-3 text-xs">
                <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => setOnlySingleUnit(true)}
                    className={`px-2.5 py-1 rounded-md font-medium ${
                      onlySingleUnit
                        ? "bg-brand-600 text-white"
                        : "text-ink-600 hover:bg-ink-50"
                    }`}
                  >
                    Single-unit only ({singleUnitCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setOnlySingleUnit(false)}
                    className={`px-2.5 py-1 rounded-md font-medium ${
                      !onlySingleUnit
                        ? "bg-brand-600 text-white"
                        : "text-ink-600 hover:bg-ink-50"
                    }`}
                  >
                    All on page ({items.length})
                  </button>
                </div>

                {visibleItems.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-ink-600 font-medium">Set all visible to:</span>
                    {[5, 10, 15].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => applyAllUpp(preset)}
                        className="px-2 py-1 rounded-md bg-white border border-ink-250 font-mono font-bold text-ink-800 hover:border-brand-500 hover:text-brand-700"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {canAdjustStock && (
                <label className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={convertExistingBatches}
                    onChange={(e) => setConvertExistingBatches(e.target.checked)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="font-semibold flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-amber-600" />
                      Convert existing batch stock in this branch proportionally
                    </div>
                    <p className="text-amber-900 mt-0.5">
                      Check this if your current batch stock (e.g. 209) represents <strong>strips</strong> rather than individual tablets — it will multiply stock (`209 × 15 = 3,135`) and divide PTR per tablet.
                    </p>
                  </div>
                </label>
              )}

              {visibleItems.length === 0 ? (
                <div className="py-12 text-center text-xs text-ink-500">
                  All items on this page already have Units / Pack &gt; 1 configured.
                </div>
              ) : (
                <div className="border border-ink-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                    <thead className="bg-ink-50 border-b border-ink-200 text-ink-600 font-semibold uppercase">
                      <tr>
                        <th className="p-2.5">Medicine</th>
                        <th className="p-2.5 text-right">Current Stock</th>
                        <th className="p-2.5">Pack Unit</th>
                        <th className="p-2.5 text-center">Units / Pack</th>
                        <th className="p-2.5">Loose Unit</th>
                        <th className="p-2.5 text-right">After Save Preview</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100">
                      {visibleItems.map((item) => {
                        const d = drafts[item.id] ?? {
                          id: item.id,
                          unitsPerPack: item.unitsPerPack || 1,
                          packUnit: item.packUnit || "strip",
                          looseUnit: item.looseUnit || "tablet",
                        };
                        const oldUpp = Math.max(1, item.unitsPerPack || 1);
                        const newUpp = Math.max(1, d.unitsPerPack || 1);
                        const isModified = newUpp !== oldUpp;
                        const projectedStock =
                          convertExistingBatches && isModified
                            ? Math.round((item.stockUnits * newUpp) / oldUpp)
                            : item.stockUnits;

                        return (
                          <tr key={item.id} className={isModified ? "bg-brand-50/30" : ""}>
                            <td className="p-2.5 font-medium text-ink-900">
                              <div>{item.name}</div>
                              {item.genericName && (
                                <div className="text-[11px] text-ink-500">{item.genericName}</div>
                              )}
                            </td>
                            <td className="p-2.5 text-right font-mono text-ink-700">
                              {item.stockUnits}
                            </td>
                            <td className="p-2.5">
                              <select
                                value={d.packUnit}
                                onChange={(e) => updateDraft(item.id, { packUnit: e.target.value })}
                                className="input !h-8 !py-1 !px-2 text-xs w-24"
                              >
                                <option value="strip">Strip</option>
                                <option value="bottle">Bottle</option>
                                <option value="pack">Pack</option>
                                <option value="box">Box</option>
                                <option value="vial">Vial</option>
                                <option value="tube">Tube</option>
                              </select>
                            </td>
                            <td className="p-2.5">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  max={1000}
                                  value={d.unitsPerPack}
                                  onChange={(e) =>
                                    updateDraft(item.id, {
                                      unitsPerPack: Math.max(1, parseInt(e.target.value, 10) || 1),
                                    })
                                  }
                                  className="input !h-8 !py-1 !px-2 w-16 text-center font-mono text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => updateDraft(item.id, { unitsPerPack: 10, packUnit: "strip" })}
                                  className="px-1.5 py-0.5 rounded border border-ink-200 text-[10px] font-mono hover:bg-ink-100"
                                >
                                  10
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateDraft(item.id, { unitsPerPack: 15, packUnit: "strip" })}
                                  className="px-1.5 py-0.5 rounded border border-ink-200 text-[10px] font-mono hover:bg-ink-100"
                                >
                                  15
                                </button>
                              </div>
                            </td>
                            <td className="p-2.5">
                              <select
                                value={d.looseUnit}
                                onChange={(e) => updateDraft(item.id, { looseUnit: e.target.value })}
                                className="input !h-8 !py-1 !px-2 text-xs w-24"
                              >
                                <option value="tablet">Tablet</option>
                                <option value="capsule">Capsule</option>
                                <option value="piece">Piece</option>
                                <option value="ml">ml</option>
                                <option value="sachet">Sachet</option>
                              </select>
                            </td>
                            <td className="p-2.5 text-right font-mono text-[11px]">
                              {isModified ? (
                                <span className="text-brand-700 font-semibold">
                                  {projectedStock} {d.looseUnit}s
                                  {newUpp > 1 && ` (${Math.floor(projectedStock / newUpp)} ${d.packUnit}s)`}
                                </span>
                              ) : (
                                <span className="text-ink-400">Unchanged</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-ink-150 bg-ink-50/50 flex items-center justify-between gap-3">
              <span className="text-xs text-ink-500">
                {changedItems.length} medicine(s) modified
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="btn btn-secondary btn-sm text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={changedItems.length === 0 || isPending}
                  onClick={handleSave}
                  className="btn btn-primary btn-sm text-xs inline-flex items-center gap-1.5"
                >
                  {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {isPending ? "Saving…" : `Save ${changedItems.length} Changes`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
