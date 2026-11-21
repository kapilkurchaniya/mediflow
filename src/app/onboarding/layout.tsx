import React from "react";
import { redirect } from "next/navigation";
import { requireAuth } from "@/server/auth";
import { Logo } from "@/app/components/ui";
import Link from "next/link";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireAuth();
  if (!user.passwordHash) {
    redirect("/setup-password?next=/onboarding");
  }

  return (
    <div className="min-h-screen bg-ink-50/50 text-ink-900 flex flex-col font-sans">
      {/* Top Banner */}
      <header className="w-full bg-white border-b border-ink-150 py-3.5 px-6 sm:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="badge badge-brand !text-[10.5px] font-semibold uppercase tracking-wider">
              Store Onboarding
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <span className="text-ink-500 hidden sm:inline">
              Signed in as <strong className="text-ink-900 font-medium">{user.name}</strong>
            </span>
            <Link
              href="/dashboard"
              className="btn btn-ghost btn-sm text-brand-700 font-semibold"
              data-tooltip="Skip onboarding and open the main MediFlow dashboard"
            >
              Skip to Dashboard &rarr;
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-xs text-ink-400 border-t border-ink-150/80 bg-white/60">
        MediFlow ERP &bull; Indian Drugs &amp; Cosmetics Rules 1945 &bull; GST Rule 46(b)
      </footer>
    </div>
  );
}

