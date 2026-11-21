"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { PasswordInput } from "@/app/components/PasswordInput";
import { GoogleAuthButton } from "@/app/components/GoogleAuthButton";

export function LoginForm({
  googleEnabled,
  oauthError,
}: {
  googleEnabled: boolean;
  oauthError?: string | null;
}) {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const errorMessage = state?.error || oauthError;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center font-bold text-2xl mx-auto shadow-lg shadow-brand-500/30">
          M
        </div>
        <h2 className="mt-6 text-3xl font-extrabold text-slate-900 tracking-tight">Sign in to MediFlow</h2>
        <p className="mt-2 text-sm text-slate-500">Pharmacy ERP, GST &amp; POS Platform</p>
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
              <GoogleAuthButton mode="login" label="Continue with Google" />
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-white px-3 text-slate-400 font-medium">or sign in with email</span>
                </div>
              </div>
            </>
          )}

          <form action={formAction} className="space-y-6">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                placeholder="you@pharmacy.com"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <PasswordInput
                id="login-password"
                name="password"
                autoComplete="current-password"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500 transition-all disabled:opacity-70"
            >
              {isPending ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            New pharmacy?{" "}
            <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-500">
              Create your MediFlow account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

