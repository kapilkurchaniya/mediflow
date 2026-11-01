"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2, X, Loader2, CheckCircle2 } from "lucide-react";
import { updateStoreMedicineSettingsAction } from "@/app/actions/store-settings";
import { actionError } from "@/lib/action-result";
import { useShell } from "@/app/components/ShellContext";
import { formatINR } from "@/lib/format";

interface BranchSettingsDialogProps {
  medicine: {
    id: string;
    name: string;
    reorderLevel: number;
    maxStock: number;
    salePrice: number | null;
  };
  initialSettings?: {
    reorderLevel: number | null;
    maxStock: number | null;
    rackId: string | null;
    salePriceOverride: number | null;
  } | null;
  racks: Array<{ id: string; code: string; name: string }>;
  isOpen: boolean;
  onClose: () => void;
}

export function BranchSettingsDialog({
  medicine,
  initialSettings,
  racks,
  isOpen,
  onClose,
}: BranchSettingsDialogProps) {
  const router = useRouter();
  const { currentStore } = useShell();

  const [rackId, setRackId] = useState<string>(initialSettings?.rackId || "");
  const [reorderLevel, setReorderLevel] = useState<string>(
    initialSettings?.reorderLevel !== null && initialSettings?.reorderLevel !== undefined
      ? String(initialSettings.reorderLevel)
      : "",
  );
  const [maxStock, setMaxStock] = useState<string>(
    initialSettings?.maxStock !== null && initialSettings?.maxStock !== undefined
      ? String(initialSettings.maxStock)
      : "",
  );
  const [salePriceOverride, setSalePriceOverride] = useState<string>(
    initialSettings?.salePriceOverride !== null && initialSettings?.salePriceOverride !== undefined
      ? (initialSettings.salePriceOverride / 100).toFixed(2)
      : "",
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const parsedReorder = reorderLevel.trim() ? parseInt(reorderLevel, 10) : null;
      const parsedMaxStock = maxStock.trim() ? parseInt(maxStock, 10) : null;
      const parsedPricePaise = salePriceOverride.trim()
        ? Math.round(parseFloat(salePriceOverride) * 100)
        : null;

      if (parsedReorder !== null && parsedMaxStock !== null && parsedReorder > parsedMaxStock) {
        setError("Reorder level cannot exceed maximum stock.");
        setSaving(false);
        return;
      }

      const res = await updateStoreMedicineSettingsAction({
        medicineId: medicine.id,
        settings: {
          rackId: rackId.trim() ? rackId : null,
          reorderLevel: parsedReorder,
          maxStock: parsedMaxStock,
          salePriceOverride: parsedPricePaise,
        },
      });

      const err = actionError(res);
      if (err) {
        setError(err);
        setSaving(false);
        return;
      }

      setSaved(true);
      router.refresh();
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save branch settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-lg p-0 shadow-2xl border border-surface-300 overflow-hidden animate-scale-in">
        <div className="flex items-center justify-between p-4 border-b border-surface-200 bg-surface-50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-brand-50 text-brand-600 border border-brand-200">
              <Settings2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-ink-900 text-sm">Branch Medicine Settings</h3>
              <p className="text-xs text-ink-500">
                {medicine.name} · <span className="font-medium text-brand-700">{currentStore?.name || "Active branch"}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-ink-400 hover:text-ink-700 hover:bg-surface-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md">
              {error}
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              Settings updated for this branch!
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-700">Store Rack / Shelf</label>
            <select
              value={rackId}
              onChange={(e) => setRackId(e.target.value)}
              className="input w-full text-xs"
            >
              <option value="">— Unassigned (No Rack) —</option>
              {racks.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} - {r.name}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-400">Physical layout assignment specific to this branch.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-ink-700">Reorder Level</label>
              <input
                type="number"
                min="0"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                placeholder={`Default: ${medicine.reorderLevel}`}
                className="input w-full text-xs"
              />
              <p className="text-[10.5px] text-ink-400">Triggers reorder suggestions.</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-ink-700">Maximum Stock</label>
              <input
                type="number"
                min="0"
                value={maxStock}
                onChange={(e) => setMaxStock(e.target.value)}
                placeholder={`Default: ${medicine.maxStock}`}
                className="input w-full text-xs"
              />
              <p className="text-[10.5px] text-ink-400">Branch storage ceiling.</p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-ink-700">Branch Price Override (₹)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={salePriceOverride}
              onChange={(e) => setSalePriceOverride(e.target.value)}
              placeholder={medicine.salePrice ? `Catalog default: ${formatINR(medicine.salePrice)}` : "None"}
              className="input w-full text-xs"
            />
            <p className="text-[11px] text-ink-400">
              Optional localized selling price. Must not exceed legal batch MRP at counter.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-200">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary text-xs"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Saving...
                </>
              ) : (
                "Save Branch Settings"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
