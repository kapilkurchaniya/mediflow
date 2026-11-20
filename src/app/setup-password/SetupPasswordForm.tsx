"use client";

import { useActionState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { setupInitialPasswordAction } from "@/app/actions/auth";

export function SetupPasswordForm({
  userName,
  userEmail,
  nextPath,
}: {
  userName: string;
  userEmail: string;
  nextPath: string;
}) {
  const [state, formAction, isPending] = useActionState(setupInitialPasswordAction, null);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center font-bold text-xl mx-auto shadow-lg shadow-brand-500/30">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="mt-6 text-3xl font-extrabold text-slate-900 tracking-tight">
          Set Your Password
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Welcome, <span className="font-semibold text-slate-700">{userName}</span> ({userEmail})
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200/80 sm:rounded-3xl sm:px-10 space-y-5">
          <div className="rounded-xl bg-brand-50/70 border border-brand-200 p-3 text-xs text-brand-900 flex items-start gap-2.5">
            <ShieldCheck className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
            <span>
              Create a password so you can sign in with email &amp; password or use the MediFlow mobile app anytime.
            </span>
          </div>

          {state?.error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl font-medium">
              {state.error}
            </div>
          )}

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="next" value={nextPath} />

            <div>
              <label htmlFor="setup-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                New Password
              </label>
              <input
                id="setup-password"
                name="password"
                type="password"
                required
                minLength={8}
                autoFocus
                autoComplete="new-password"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                placeholder="Minimum 8 characters"
              />
            </div>

            <div>
              <label htmlFor="setup-confirm" className="block text-sm font-medium text-slate-700 mb-1.5">
                Confirm Password
              </label>
              <input
                id="setup-confirm"
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                placeholder="Re-enter your password"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-all disabled:opacity-70"
            >
              {isPending ? "Saving password..." : "Save Password & Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

