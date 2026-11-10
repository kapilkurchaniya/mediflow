import React from "react";
import { requireAuth } from "@/server/auth";
import { Pill } from "lucide-react";
import Link from "next/link";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireAuth();

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* Top Banner */}
      <header className="w-full bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 py-4 px-6 sm:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                MediFlow
              </span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider">
                Store Onboarding
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
              Signed in as <strong className="text-slate-800 dark:text-slate-200 font-medium">{user.name}</strong>
            </span>
            <Link
              href="/dashboard"
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
            >
              Skip to Dashboard &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {children}
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs text-slate-400 border-t border-slate-200/60 dark:border-slate-800/60">
        MediFlow ERP &bull; Indian Drugs & Cosmetics Rules 1945 &bull; GST Rule 46(b)
      </footer>
    </div>
  );
}

