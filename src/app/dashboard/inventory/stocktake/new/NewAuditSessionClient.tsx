"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createStockAuditSessionAction } from "@/app/actions/stocktake";
import {
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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl card p-6">
      {error && (
        <div className="alert-error text-xs">
          {error}
        </div>
      )}

      {/* Scope Selector */}
      <div className="space-y-2">
        <label className="label text-xs uppercase tracking-wider">
          Audit Scope
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setScope("racks")}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              scope === "racks"
                ? "border-brand-500 bg-brand-50/50 text-brand-900 ring-2 ring-brand-500/20"
                : "border-ink-200 hover:border-ink-300 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-ink-900">Selected Racks</span>
              <Layers className="w-4 h-4 text-brand-600" />
            </div>
            <p className="text-xs text-ink-500 mt-1">
              Audit specific shelves/sections (e.g. Rack A-1, B-2)
            </p>
          </button>

          <button
            type="button"
            onClick={() => setScope("full_store")}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
              scope === "full_store"
                ? "border-brand-500 bg-brand-50/50 text-brand-900 ring-2 ring-brand-500/20"
                : "border-ink-200 hover:border-ink-300 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-ink-900">Entire Store</span>
              <Store className="w-4 h-4 text-brand-600" />
            </div>
            <p className="text-xs text-ink-500 mt-1">
              Full inventory count across all batches in this store
            </p>
          </button>
        </div>
      </div>

      {/* Rack Multi-select if scope is racks */}
      {scope === "racks" && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <label className="label text-xs uppercase tracking-wider">
              Choose Racks to Audit ({selectedRackIds.length}/{racks.length})
            </label>
            {racks.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllRacks}
                className="text-xs text-brand-600 hover:underline cursor-pointer"
              >
                {selectedRackIds.length === racks.length ? "Deselect All" : "Select All"}
              </button>
            )}
          </div>

          {racks.length === 0 ? (
            <div className="p-4 rounded-lg bg-ink-50 border border-ink-150 text-xs text-ink-500">
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
                    className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                      isChecked
                        ? "bg-brand-50/70 border-brand-300 text-brand-950 font-semibold"
                        : "bg-ink-50/40 border-ink-200 text-ink-700 hover:bg-ink-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      className="checkbox mt-0.5"
                    />
                    <div>
                      <div className="font-bold text-ink-900">{rack.code}</div>
                      <div className="text-[10.5px] text-ink-500 font-normal">
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
      <div className="p-4 rounded-lg bg-ink-50/70 border border-ink-200 flex items-start gap-3">
        <div className="mt-0.5 text-brand-600">
          {blindCount ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-xs text-ink-900">
              Blind Count Mode
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={blindCount}
                onChange={(e) => setBlindCount(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-ink-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>
          <p className="text-[11px] text-ink-500 mt-0.5">
            When enabled, counting staff cannot see the system quantities on the sheet, preventing
            cognitive confirmation bias and ensuring high data integrity.
          </p>
        </div>
      </div>

      {/* Notes / Audit Memo */}
      <div>
        <label className="label text-xs uppercase tracking-wider mb-1.5">
          Audit Notes / Memo (Optional)
        </label>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Monthly scheduled rack count for Fast Moving Antibiotics..."
          className="input input-sm py-2"
        />
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-end gap-3 pt-3 border-t border-ink-150">
        <Link
          href="/dashboard/inventory/stocktake"
          className="btn btn-secondary btn-sm"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-primary btn-sm"
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
