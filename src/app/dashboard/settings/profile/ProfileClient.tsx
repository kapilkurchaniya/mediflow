"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/actions/auth";

export function ProfileClient({ hasPassword = true }: { hasPassword?: boolean }) {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);

  return (
    <form action={formAction} className="card p-5 space-y-4 max-w-md">
      <div>
        <h2 className="text-[15px] font-semibold text-ink-900">
          {hasPassword ? "Change password" : "Set a password"}
        </h2>
        <p className="mt-1 text-[13px] text-ink-500">
          {hasPassword
            ? "Use at least 8 characters. Changing your password signs you out of every other device."
            : "You signed up with Google. Set a password so you can also sign in with your email and password."}
        </p>
      </div>

      {hasPassword && (
        <label className="block text-xs font-medium text-ink-700">
          Current password
          <input type="password" name="current" autoComplete="current-password" required className="input mt-1" />
        </label>
      )}
      <label className="block text-xs font-medium text-ink-700">
        {hasPassword ? "New password" : "Password"}
        <input type="password" name="next" autoComplete="new-password" required minLength={8} className="input mt-1" />
      </label>
      <label className="block text-xs font-medium text-ink-700">
        {hasPassword ? "Confirm new password" : "Confirm password"}
        <input type="password" name="confirm" autoComplete="new-password" required minLength={8} className="input mt-1" />
      </label>

      {state?.error && <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-[12.5px] text-red-700">{state.error}</div>}
      {state?.success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-[12.5px] text-emerald-800">{state.success}</div>}

      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? "Saving…" : hasPassword ? "Change password" : "Set password"}
      </button>
    </form>
  );
}
