"use client";

import { useState, useTransition } from "react";
import { unlinkGoogleAccountAction } from "@/app/actions/oauth";
import { GoogleAuthButton } from "@/app/components/GoogleAuthButton";

interface GoogleLinkCardProps {
  googleEnabled: boolean;
  linkedEmail: string | null;
  hasPassword: boolean;
  statusBanner?: string | null;
}

export function GoogleLinkCard({ googleEnabled, linkedEmail, hasPassword, statusBanner }: GoogleLinkCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!googleEnabled && !linkedEmail) return null;

  function handleUnlink() {
    setError(null);
    startTransition(async () => {
      const res = await unlinkGoogleAccountAction();
      if (!res.ok) setError(res.error ?? "Failed to unlink Google account.");
    });
  }

  return (
    <div className="card p-5 max-w-3xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Connected Accounts</p>
          <h2 className="text-[15px] font-semibold text-ink-900">Google Sign-In</h2>
          <p className="text-sm text-ink-600 mt-0.5">
            {linkedEmail
              ? `Linked to ${linkedEmail}`
              : "Connect your Google account for one-click sign-in."}
          </p>
        </div>

        <div className="sm:w-56 shrink-0">
          {linkedEmail ? (
            <button
              type="button"
              onClick={handleUnlink}
              disabled={isPending || !hasPassword}
              title={!hasPassword ? "Set a password before disconnecting Google Sign-In" : undefined}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Disconnecting..." : "Disconnect Google"}
            </button>
          ) : (
            <GoogleAuthButton mode="link" label="Connect Google" />
          )}
        </div>
      </div>

      {statusBanner && (
        <div className="p-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
          {statusBanner}
        </div>
      )}

      {linkedEmail && !hasPassword && (
        <p className="text-xs text-slate-500">
          Your account currently signs in exclusively via Google.
        </p>
      )}

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl">
          {error}
        </div>
      )}
    </div>
  );
}

