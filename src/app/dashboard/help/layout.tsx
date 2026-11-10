import React from "react";
import Link from "next/link";
import { BookOpen, LifeBuoy, ArrowLeft } from "lucide-react";
import { PilotFeedbackModal } from "./_components/PilotFeedbackModal";

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ink-50/40 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-ink-150 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-100 text-primary-700">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href="/dashboard"
                  className="text-xs font-medium text-ink-500 hover:text-ink-700 flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" /> Dashboard
                </Link>
                <span className="text-ink-300">/</span>
                <span className="text-xs font-semibold text-primary-700">Help Center</span>
              </div>
              <h1 className="text-xl font-bold text-ink-900 tracking-tight mt-0.5">
                MediFlow Knowledge Base & SOPs
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/dashboard/help"
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 shadow-2xs hover:bg-ink-50"
            >
              <LifeBuoy className="h-3.5 w-3.5 text-primary-600" />
              All Guides
            </Link>
            <PilotFeedbackModal />
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  );
}

