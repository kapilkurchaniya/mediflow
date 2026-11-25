"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, X, AlertCircle, Check, Loader2 } from "lucide-react";
import { createMedicine } from "@/app/actions/inventory";

interface QuickCreateMedicineModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialName?: string;
  onCreated?: (medicine: { id: string; name: string }) => Promise<void> | void;
}

export function QuickCreateMedicineModal({
  isOpen,
  onClose,
  initialName = "",
  onCreated,
}: QuickCreateMedicineModalProps) {
  if (!isOpen) return null;
  return (
    <QuickCreateMedicineModalContent
      key={initialName}
      onClose={onClose}
      initialName={initialName}
      onCreated={onCreated}
    />
  );
}

function QuickCreateMedicineModalContent({
  onClose,
  initialName,
  onCreated,
}: {
  onClose: () => void;
  initialName: string;
  onCreated?: (medicine: { id: string; name: string }) => Promise<void> | void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [genericName, setGenericName] = useState("");
  const [packUnit, setPackUnit] = useState("strip");
  const [unitsPerPack, setUnitsPerPack] = useState("10");
  const [gstRate, setGstRate] = useState("5");
  const [mrp, setMrp] = useState("");
  const [schedule, setSchedule] = useState("none");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Medicine name is required.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      if (genericName.trim()) fd.set("genericName", genericName.trim());
      fd.set("packUnit", packUnit);
      fd.set("unit", packUnit);
      fd.set("looseUnit", packUnit === "strip" ? "tablet" : "unit");
      fd.set("unitsPerPack", String(Math.max(1, parseInt(unitsPerPack, 10) || 1)));
      fd.set("gstRateBp", gstRate);
      if (mrp.trim()) {
        fd.set("mrp", mrp.trim());
        fd.set("salePrice", mrp.trim());
      }
      fd.set("schedule", schedule);
      if (schedule !== "none") fd.set("rxRequired", "on");

      const res = await createMedicine(fd);
      if (res?.error) {
        setError(res.error);
        return;
      }

      if (res?.id) {
        await onCreated?.({ id: res.id, name: name.trim() });
      }
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create medicine.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white border border-ink-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-4 border-b border-ink-150 bg-ink-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-200 text-brand-600 flex items-center justify-center">
              <Pill className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-ink-900 text-sm">Quick Add Medicine</h3>
              <p className="text-[11.5px] text-ink-500">
                Add to your item master without leaving this screen.
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="label required">Medicine Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Dolo 650mg Tablet"
              className="input"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Generic / Salt</label>
              <input
                type="text"
                value={genericName}
                onChange={(e) => setGenericName(e.target.value)}
                placeholder="e.g., Paracetamol 650mg"
                className="input"
              />
            </div>
            <div>
              <label className="label">Schedule</label>
              <select
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="select"
              >
                <option value="none">OTC / Non-Scheduled</option>
                <option value="H">Schedule H</option>
                <option value="H1">Schedule H1</option>
                <option value="X">Schedule X</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="label">Pack Unit</label>
              <select
                value={packUnit}
                onChange={(e) => setPackUnit(e.target.value)}
                className="select"
              >
                <option value="strip">Strip</option>
                <option value="bottle">Bottle</option>
                <option value="box">Box</option>
                <option value="tube">Tube</option>
                <option value="vial">Vial</option>
              </select>
            </div>
            <div>
              <label className="label">Units / Pack</label>
              <input
                type="number"
                min={1}
                value={unitsPerPack}
                onChange={(e) => setUnitsPerPack(e.target.value)}
                className="input num"
              />
            </div>
            <div>
              <label className="label">GST %</label>
              <select
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value)}
                className="select"
              >
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="12">12%</option>
                <option value="18">18%</option>
                <option value="28">28%</option>
              </select>
            </div>
            <div>
              <label className="label">MRP (₹)</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
                placeholder="0.00"
                className="input num"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-ink-150 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              {isSaving ? "Saving…" : "Save Medicine"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
