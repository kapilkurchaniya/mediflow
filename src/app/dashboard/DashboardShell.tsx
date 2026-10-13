"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/app/components/Sidebar";
import { Topbar } from "@/app/components/Topbar";
import { AIAssistant } from "@/app/components/AIAssistant";

interface DashboardShellProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  storeName: string;
}

export function DashboardShell({
  children,
  userName,
  userEmail,
  storeName,
}: DashboardShellProps) {
  const pathname = usePathname();
  const isPrintMode = pathname?.endsWith("/print") || pathname?.includes("/print");

  // On print routes, do not render dashboard shell, sidebar, topbar, or AIAssistant.
  // This completely eliminates any layout leakage into browser print previews.
  if (isPrintMode) {
    return <main className="min-h-screen bg-white">{children}</main>;
  }

  return (
    <div className="relative isolate flex h-screen overflow-hidden bg-background print:h-auto print:overflow-visible print:bg-white print:block">
      {/* Ambient background for the translucent shell */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,var(--color-brand-100),transparent)] print:hidden"
        aria-hidden="true"
      />

      <div className="print:hidden">
        <Sidebar userName={userName} userEmail={userEmail} storeName={storeName} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col print:w-full print:block">
        <div className="print:hidden">
          <Topbar />
        </div>
        <main className="flex-1 overflow-y-auto print:overflow-visible print:p-0 print:m-0 print:block">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 print:p-0 print:m-0 print:max-w-none">
            {children}
          </div>
        </main>
      </div>

      <div className="print:hidden">
        <AIAssistant />
      </div>
    </div>
  );
}
