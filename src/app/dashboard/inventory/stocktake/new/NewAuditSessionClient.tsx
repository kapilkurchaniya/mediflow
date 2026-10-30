"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createStockAuditSessionAction } from "@/app/actions/stocktake";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Store,
} from "lucide-react";

interface Rack {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

interface Props {
  racks: Rack[];
}

export function NewAuditSessionClient({ racks }: Props) {
  const router = useRouter();
  const [scope, setScope] = useState<"full_store" | "racks">("racks");
  const [selectedRackIds, setSelectedRackIds] = useState<string[]>([]);
  const [blindCount, setBlindCount] = useState<boolean>(true);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleRack = (id: string) => {
    setSelectedRackIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const handleSelectAllRacks = () => {
    if (selectedRackIds.length === racks.length) {
      setSelectedRackIds([]);
    } else {
      setSelectedRackIds(racks.map((r) => r.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (scope === "racks" && selectedRackIds.length === 0) {
      setError("Please select at least one rack for the audit session");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createStockAuditSessionAction({
        scope,
        rackIds: scope === "racks" ? selectedRackIds : [],
        blindCount,
        notes,
      });

      if (res.success && res.sessionId) {
        router.push(`/dashboard/inventory/stocktake/${res.sessionId}`);
      } else {
        setError(res.error || "Failed to initialize audit session");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating session";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Scope Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Audit Scope
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setScope("racks")}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              scope === "racks"
                ? "border-teal-500 bg-teal-50/50 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200 ring-2 ring-teal-500/20"
                : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">Selected Racks</span>
              <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Audit specific shelves/sections (e.g. Rack A-1, B-2)
            </p>
          </button>

          <button
            type="button"
            onClick={() => setScope("full_store")}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              scope === "full_store"
                ? "border-teal-500 bg-teal-50/50 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200 ring-2 ring-teal-500/20"
                : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm">Entire Store</span>
              <Store className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Full inventory count across all batches in this store
            </p>
          </button>
        </div>
      </div>

      {/* Rack Multi-select if scope is racks */}
      {scope === "racks" && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Choose Racks to Audit ({selectedRackIds.length}/{racks.length})
            </label>
            {racks.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllRacks}
                className="text-xs text-teal-600 hover:underline cursor-pointer"
              >
                {selectedRackIds.length === racks.length ? "Deselect All" : "Select All"}
              </button>
            )}
          </div>

          {racks.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border text-xs text-slate-500">
              No racks found for this store. You can run an Entire Store count instead, or configure racks in master settings.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1">
              {racks.map((rack) => {
                const isChecked = selectedRackIds.includes(rack.id);
                return (
                  <div
                    key={rack.id}
                    onClick={() => handleToggleRack(rack.id)}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isChecked
                        ? "bg-teal-50/70 border-teal-300 dark:bg-teal-950/40 dark:border-teal-800 text-teal-950 dark:text-teal-100 font-semibold"
                        : "bg-slate-50/50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // handled by parent div
                      className="rounded mt-0.5 text-teal-600"
                    />
                    <div>
                      <div className="font-bold">{rack.code}</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                        {rack.name}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Blind Count Mode Toggle */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-start gap-3">
        <div className="mt-0.5 text-blue-600 dark:text-blue-400">
          {blindCount ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-slate-900 dark:text-white">
              Blind Count Mode
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={blindCount}
                onChange={(e) => setBlindCount(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
            </label>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            When enabled, counting staff cannot see the system quantities on the sheet, preventing
            cognitive confirmation bias and ensuring high data integrity.
          </p>
        </div>
      </div>

      {/* Notes / Audit Memo */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
          Audit Notes / Memo (Optional)
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Monthly scheduled rack count for Fast Moving Antibiotics..."
          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs focus:outline-none focus:border-teal-500"
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
        <Link
          href="/dashboard/inventory/stocktake"
          className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Initializing Audit Snapshot...
            </>
          ) : (
            <>
              <ClipboardCheck className="w-4 h-4" />
              Start Audit Session
            </>
          )}
        </button>
      </div>
    </form>
  );
}

