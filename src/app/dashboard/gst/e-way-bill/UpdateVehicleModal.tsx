"use client";

import { useState } from "react";
import { Truck, X, AlertTriangle, Check, Loader2 } from "lucide-react";
import { updateEWayBillVehicleAction } from "@/app/actions/gst";
import type { EWayBillItem } from "./types";

interface UpdateVehicleModalProps {
  updateDoc: EWayBillItem;
  onClose: () => void;
  onSuccess: () => void;
}

export function UpdateVehicleModal({
  updateDoc,
  onClose,
  onSuccess,
}: UpdateVehicleModalProps) {
  const [newVehicleNo, setNewVehicleNo] = useState("");
  const [fromPlace, setFromPlace] = useState("");
  const [fromState, setFromState] = useState("27");
  const [reasonCode, setReasonCode] = useState<"1" | "2" | "3" | "4">("2");
  const [reasonRemark, setReasonRemark] = useState("");
  const [updating, setUpdating] = useState(false);

  const normalizedVehicle = newVehicleNo.replace(/[\s-]/g, "").toUpperCase();
  const isVehicleValid = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(normalizedVehicle);

  async function handleUpdateVehicle() {
    if (!isVehicleValid) {
      alert("Please enter a valid Indian vehicle registration number (e.g. MH12AB1234)");
      return;
    }
    setUpdating(true);
    try {
      const res = await updateEWayBillVehicleAction(updateDoc.id, {
        vehicleNo: normalizedVehicle,
        fromPlace: fromPlace.trim() || "Headquarters",
        fromState: fromState.trim() || "27",
        reasonCode,
        reasonRemark: reasonRemark.trim() || undefined,
      });

      if ("error" in res && res.error) {
        alert("Failed to update vehicle: " + res.error);
      } else {
        onSuccess();
      }
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-xl border border-ink-150 bg-white p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-ink-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-ink-900">Update Part-B Vehicle</h3>
              <p className="text-xs text-ink-500">E-Way Bill: {updateDoc.eWayBillNo}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-600 rounded-lg p-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-medium text-ink-700 mb-1">
              New Vehicle Registration Number *
            </label>
            <input
              type="text"
              placeholder="e.g. MH12AB1234 or DL01A9999"
              value={newVehicleNo}
              onChange={(e) => setNewVehicleNo(e.target.value.toUpperCase())}
              className="input w-full font-mono text-sm uppercase bg-white"
            />
            {newVehicleNo.length > 0 && !isVehicleValid && (
              <p className="mt-1 text-[11px] text-rose-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Standard Indian format required (e.g. MH12AB1234)
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-ink-700 mb-1">
                From Place / City *
              </label>
              <input
                type="text"
                placeholder="e.g. Pune"
                value={fromPlace}
                onChange={(e) => setFromPlace(e.target.value)}
                className="input w-full bg-white"
              />
            </div>
            <div>
              <label className="block font-medium text-ink-700 mb-1">
                State Code (GST) *
              </label>
              <input
                type="text"
                maxLength={2}
                placeholder="e.g. 27"
                value={fromState}
                onChange={(e) => setFromState(e.target.value)}
                className="input w-full font-mono bg-white"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-ink-700 mb-1">
              Reason for Updation *
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as "1" | "2" | "3" | "4")}
              className="select w-full bg-white text-xs"
            >
              <option value="2">2 - Due to Transshipment (Hub transfer)</option>
              <option value="1">1 - Due to Vehicle Breakdown</option>
              <option value="4">4 - First Time (Vehicle assignment)</option>
              <option value="3">3 - Others</option>
            </select>
          </div>

          <div>
            <label className="block font-medium text-ink-700 mb-1">
              Remarks / Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Transferred at Bhiwandi logistics hub"
              value={reasonRemark}
              onChange={(e) => setReasonRemark(e.target.value)}
              className="input w-full bg-white"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isVehicleValid || updating}
            onClick={handleUpdateVehicle}
            className="btn btn-primary text-xs disabled:opacity-50 flex items-center gap-1.5"
          >
            {updating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Confirm Vehicle Update
          </button>
        </div>
      </div>
    </div>
  );
}

