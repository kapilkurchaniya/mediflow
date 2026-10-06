"use client";

import Link from "next/link";
import { Activity } from "lucide-react";
import { useActionState } from "react";
import { registerAction } from "@/app/actions/auth";

export default function RegisterPage() {
  const [state, formAction, isPending] = useActionState(registerAction, null);

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 bg-brand-100 text-brand-600 rounded-2xl mb-4">
            <Activity className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Create your pharmacy</h1>
          <p className="text-slate-600 mt-2">Start your 14-day free trial. No credit card required.</p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
          <form action={formAction} className="space-y-5">
            {state?.error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl">
                {state.error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Full Name</label>
              <input
                type="text"
                name="name"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
                placeholder="Rahul Sharma"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Pharmacy Name</label>
              <input
                type="text"
                name="pharmacyName"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
                placeholder="Apollo Pharmacy"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email address</label>
              <input
                type="email"
                name="email"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
                placeholder="rahul@pharmacy.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Password</label>
              <input
                type="password"
                name="password"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-shadow"
                placeholder="••••••••"
                required
                minLength={8}
              />
            </div>
            
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-brand-500/30 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isPending ? "Creating Account..." : "Create Account"}
            </button>
          </form>
        </div>

        <p className="text-center mt-8 text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-500">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
