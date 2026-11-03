"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, ShieldAlert } from "lucide-react";

interface OneTimeTokenModalProps {
  deviceName: string;
  deviceCode: string;
  rawToken: string;
  isRotation?: boolean;
  onClose: () => void;
}

export function OneTimeTokenModal({
  deviceName,
  deviceCode,
  rawToken,
  isRotation = false,
  onClose,
}: OneTimeTokenModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(rawToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-ink-150 bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink-900">
              {isRotation ? "Device Token Rotated" : "Terminal Registered"}
            </h3>
            <p className="text-xs text-ink-500">
              Terminal: <span className="font-semibold text-ink-800">{deviceName}</span> (Code: <code className="font-mono text-brand-700">{deviceCode}</code>)
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Save this pairing token immediately.</p>
            <p className="text-amber-800 leading-relaxed">
              This token will <strong>never be shown again</strong>. For security, only a SHA-256 hash is retained on the server. If lost, you must rotate the token.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="text-xs font-medium text-ink-700">Pairing Token (Bearer Credential)</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={rawToken}
              className="flex-1 font-mono text-xs p-2.5 rounded-lg border border-ink-200 bg-ink-50/50 text-ink-900 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-ink-200 bg-white hover:bg-ink-50 text-xs font-medium text-ink-800 transition"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  <span className="text-emerald-700">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 text-ink-500" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg shadow-sm transition"
          >
            I have saved this token
          </button>
        </div>
      </div>
    </div>
  );
}
