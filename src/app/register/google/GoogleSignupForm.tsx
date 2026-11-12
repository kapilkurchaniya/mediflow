"use client";

import { useActionState } from "react";
import Link from "next/link";
import { completeGoogleSignupAction } from "@/app/actions/oauth";

export function GoogleSignupForm({ name, email }: { name: string; email: string }) {
  const [state, formAction, isPending] = useActionState(completeGoogleSignupAction, null);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center font-bold text-2xl mx-auto shadow-lg shadow-brand-500/30">
          M
        </div>
        <h2 className="mt-6 text-3xl font-extrabold text-slate-900 tracking-tight">Complete Your Workspace</h2>
        <p className="mt-2 text-sm text-slate-500">
          Google account: <span className="font-medium text-slate-700">{email}</span>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200/80 sm:rounded-3xl sm:px-10">
          {state?.error && (
            <div className="mb-5 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl font-medium">
              {state.error}
            </div>
          )}

          <form action={formAction} className="space-y-5">
            <div>
              <label htmlFor="google-pharmacy" className="block text-sm font-medium text-slate-700 mb-1.5">
                Pharmacy Name
              </label>
              <input
                id="google-pharmacy"
                name="pharmacyName"
                type="text"
                required
                minLength={2}
                autoFocus
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                placeholder="Apex Health Pharmacy"
              />
            </div>

            <div>
              <label htmlFor="google-fullname" className="block text-sm font-medium text-slate-700 mb-1.5">
                Your Full Name
              </label>
              <input
                id="google-fullname"
                name="fullName"
                type="text"
                required
                minLength={2}
                defaultValue={name}
                autoComplete="name"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                placeholder="Dr. Aarav Sharma"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="google-password" className="block text-sm font-medium text-slate-700">
                  Set Password <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
              </div>
              <input
                id="google-password"
                name="password"
                type="password"
                autoComplete="new-password"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                placeholder="Min 8 chars — leave blank to skip"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                You can skip this now and set a password later in Account Settings.
              </p>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-all disabled:opacity-70"
            >
              {isPending ? "Creating workspace..." : "Create Workspace & Go to Dashboard"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            Wrong Google account?{" "}
            <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-500">
              Use another account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
