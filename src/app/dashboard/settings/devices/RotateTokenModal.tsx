"use client";

import { useState, useTransition } from "react";
import { KeyRound, Loader2, ShieldAlert, X } from "lucide-react";
import { rotateDeviceTokenAction } from "@/app/actions/devices";
import type { Device } from "@/server/db/schema/devices";

interface RotateTokenModalProps {
  device: Device;
  onSuccess: (data: { deviceName: string; deviceCode: string; rawToken: string }) => void;
  onClose: () => void;
}

export function RotateTokenModal({
  device,
  onSuccess,
  onClose,
}: RotateTokenModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRotate = () => {
    setError(null);
    startTransition(async () => {
      const res = await rotateDeviceTokenAction({ deviceId: device.id });
      if (res?.data?.success && res.data.rawToken) {
        onSuccess({
          deviceName: res.data.device.name,
          deviceCode: res.data.device.code,
          rawToken: res.data.rawToken,
        });
      } else {
        setError(res?.serverError || "Failed to rotate device token.");
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-ink-150 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-ink-100">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-600" />
            <h3 className="text-base font-semibold text-ink-900">Rotate Pairing Key</h3>
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
            You are about to rotate the pairing key for terminal{" "}
            <span className="font-semibold text-ink-900">{device.name}</span> (Code:{" "}
            <code className="font-mono text-brand-700">{device.code}</code>).
          </p>

          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 flex items-start gap-2 text-amber-900">
            <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              The existing pairing key will be <strong>invalidated immediately</strong>. You will need to configure the workstation with the new key to resume synchronization.
            </p>
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
            onClick={handleRotate}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition disabled:opacity-50"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Rotate Key</span>
          </button>
        </div>
      </div>
    </div>
  );
}
