"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { revokeDeviceAction } from "@/app/actions/devices";
import type { Device } from "@/server/db/schema/devices";

interface RevokeDeviceModalProps {
  device: Device;
  onSuccess: (updatedDevice: Device) => void;
  onClose: () => void;
}

export function RevokeDeviceModal({
  device,
  onSuccess,
  onClose,
}: RevokeDeviceModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRevoke = () => {
    setError(null);
    startTransition(async () => {
      const res = await revokeDeviceAction({
        deviceId: device.id,
        reason: reason.trim() || undefined,
      });

      if (res?.data?.success && res.data.device) {
        onSuccess(res.data.device);
      } else {
        setError(res?.serverError || "Failed to revoke device.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-ink-150 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            <h3 className="text-base font-semibold text-ink-900">Revoke Terminal Access</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-400 hover:text-ink-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            {error}
          </div>
        )}

        <div className="mt-4 space-y-3 text-xs text-ink-600">
          <p>
            Are you sure you want to revoke access for terminal{" "}
            <span className="font-semibold text-ink-900">{device.name}</span> (Code:{" "}
            <code className="font-mono text-brand-700">{device.code}</code>)?
          </p>

          <p className="text-rose-700 font-medium">
            This will immediately prevent this workstation from syncing sales, stock, and reservations.
          </p>

          <div>
            <label className="text-xs font-medium text-ink-700">Reason for revocation (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Counter decommissioned, hardware replacement"
              className="mt-1 w-full rounded-lg border border-ink-200 p-2 text-xs text-ink-900 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-ink-100">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-3.5 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Revoke Access</span>
          </button>
        </div>
      </div>
    </div>
  );
}
