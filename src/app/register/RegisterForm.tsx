"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "@/app/actions/auth";
import { GoogleAuthButton } from "@/app/components/GoogleAuthButton";

export function RegisterForm({
  googleEnabled,
  oauthError,
}: {
  googleEnabled: boolean;
  oauthError?: string | null;
}) {
  const [state, formAction, isPending] = useActionState(registerAction, null);
  const errorMessage = state?.error || oauthError;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center font-bold text-2xl mx-auto shadow-lg shadow-brand-500/30">
          M
        </div>
        <h2 className="mt-6 text-3xl font-extrabold text-slate-900 tracking-tight">Create Pharmacy Account</h2>
        <p className="mt-2 text-sm text-slate-500">Launch your AI-native pharmacy ERP in 60 seconds</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200/80 sm:rounded-3xl sm:px-10">
          {errorMessage && (
            <div className="mb-5 p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl font-medium">
              {errorMessage}
            </div>
          )}

          {googleEnabled && (
            <>
              <GoogleAuthButton mode="register" label="Sign up with Google" />
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-white px-3 text-slate-400 font-medium">or register with email</span>
                </div>
              </div>
            </>
          )}

          <form action={formAction} className="space-y-5">
            <div>
              <label htmlFor="reg-pharmacy" className="block text-sm font-medium text-slate-700 mb-1.5">
                Pharmacy Name
              </label>
              <input
                id="reg-pharmacy"
                name="pharmacyName"
                type="text"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                placeholder="Apex Health Pharmacy"
              />
            </div>

            <div>
              <label htmlFor="reg-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                Your Full Name
              </label>
              <input
                id="reg-name"
                name="name"
                type="text"
                autoComplete="name"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                placeholder="Dr. Aarav Sharma"
              />
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <input
                id="reg-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                placeholder="aarav@apexhealth.in"
              />
            </div>

            <div>
              <label htmlFor="reg-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <input
                id="reg-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                placeholder="At least 8 characters"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-all disabled:opacity-70 mt-2"
            >
              {isPending ? "Creating workspace..." : "Create Workspace"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-500">
              Sign in here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

