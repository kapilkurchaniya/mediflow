"use client";

import { useState } from "react";
import { AlertCircle, Loader2, Truck, X } from "lucide-react";
import { formatINR } from "@/lib/format";

interface DispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    transportMode: "road" | "rail" | "air";
    vehicleNo?: string;
    transporterName?: string;
    transporterId?: string;
    eWayBillNo?: string;
  }) => Promise<void>;
  isSubmitting: boolean;
  totalValuePaise: number;
}

export function DispatchModal({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  totalValuePaise,
}: DispatchModalProps) {
  const [transportMode, setTransportMode] = useState<"road" | "rail" | "air">("road");
  const [vehicleNo, setVehicleNo] = useState("");
  const [transporterName, setTransporterName] = useState("");
  const [transporterId, setTransporterId] = useState("");
  const [eWayBillNo, setEWayBillNo] = useState("");

  if (!isOpen) return null;

  const isEWayBillRequired = totalValuePaise > 50_000_00;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirm({
      transportMode,
      vehicleNo: vehicleNo.trim() || undefined,
      transporterName: transporterName.trim() || undefined,
      transporterId: transporterId.trim() || undefined,
      eWayBillNo: eWayBillNo.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-ink-950/40 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="relative w-full max-w-lg rounded-xl border border-ink-200 bg-white p-6 shadow-2xl transition-all">
        <div className="flex items-center justify-between pb-3 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-50 rounded-lg text-brand-600">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-900">Dispatch Stock Transfer</h2>
              <p className="text-xs text-ink-500">Record transport details and deduct inventory from source.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isEWayBillRequired && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold">E-Way Bill Mandatory (CGST Rule 138)</p>
              <p className="text-amber-700 mt-0.5">
                Consignment valuation ({formatINR(totalValuePaise)}) exceeds the ₹50,000 threshold.
                Please ensure an E-Way bill is generated prior to vehicle departure.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Transport Mode</label>
              <select
                value={transportMode}
                onChange={(e) => setTransportMode(e.target.value as "road" | "rail" | "air")}
                className="w-full rounded-lg border border-ink-200 bg-white p-2 text-xs font-medium text-ink-900 focus:border-brand-500 focus:outline-none"
              >
                <option value="road">Road</option>
                <option value="rail">Rail</option>
                <option value="air">Air</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Vehicle Number</label>
              <input
                type="text"
                placeholder="e.g. MH-12-AB-1234"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                className="w-full rounded-lg border border-ink-200 p-2 text-xs text-ink-900 focus:border-brand-500 focus:outline-none uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Transporter Name</label>
              <input
                type="text"
                placeholder="e.g. Blue Dart / Self Delivery"
                value={transporterName}
                onChange={(e) => setTransporterName(e.target.value)}
                className="w-full rounded-lg border border-ink-200 p-2 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">Transporter ID / GSTIN</label>
              <input
                type="text"
                placeholder="e.g. 27AAAAA0000A1Z5"
                value={transporterId}
                onChange={(e) => setTransporterId(e.target.value)}
                className="w-full rounded-lg border border-ink-200 p-2 text-xs text-ink-900 focus:border-brand-500 focus:outline-none uppercase"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1">
              E-Way Bill Number {isEWayBillRequired ? "(Required for > ₹50k)" : "(Optional)"}
            </label>
            <input
              type="text"
              placeholder="e.g. 121345678901"
              value={eWayBillNo}
              onChange={(e) => setEWayBillNo(e.target.value)}
              className="w-full rounded-lg border border-ink-200 p-2 text-xs text-ink-900 focus:border-brand-500 focus:outline-none font-mono"
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm Dispatch
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
