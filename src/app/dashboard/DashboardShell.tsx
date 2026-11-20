"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/app/components/Sidebar";
import { Topbar } from "@/app/components/Topbar";
import { ShellProvider, useShell } from "@/app/components/ShellContext";
import { GlobalTooltipLayer } from "@/app/components/GlobalTooltipLayer";
import type { AllowedStoreItem } from "@/server/domain/stores";
import clsx from "clsx";

const AIAssistant = dynamic(() => import("@/app/components/AIAssistant").then((m) => m.AIAssistant), {
  ssr: false,
});
const CommandPalette = dynamic(
  () => import("@/app/components/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false }
);
const ShortcutsModal = dynamic(
  () => import("@/app/components/ShortcutsModal").then((m) => m.ShortcutsModal),
  { ssr: false }
);
const CounterCalculator = dynamic(
  () => import("@/app/components/CounterCalculator").then((m) => m.CounterCalculator),
  { ssr: false }
);
const StoreSwitcherDialog = dynamic(
  () => import("@/app/components/StoreSwitcherDialog").then((m) => m.StoreSwitcherDialog),
  { ssr: false }
);

interface DashboardShellProps {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userId?: string;
  tenantId?: string | null;
  storeName: string;
  currentStore?: AllowedStoreItem | null;
  allowedStores?: AllowedStoreItem[];
  permissions: readonly string[];
}

function DashboardShellContent({
  children,
  userName,
  userEmail,
  storeName,
  permissions,
}: DashboardShellProps) {
  const pathname = usePathname();
  const { mobileOpen, setMobileOpen, calculatorOpen, setCalculatorOpen } = useShell();

  const isPrintMode = pathname?.endsWith("/print") || pathname?.includes("/print");
  const isPosTerminal = pathname === "/dashboard/sales/pos";

  // Complete elimination of layout leakage on invoice/thermal print routes
  if (isPrintMode) {
    return <main className="min-h-screen bg-white">{children}</main>;
  }

  return (
    <div className="relative isolate flex h-screen overflow-hidden bg-background print:h-auto print:overflow-visible print:bg-white print:block">
      {/* Skip to Main Content Link for Keyboard & Screen-Reader Accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-ink-900 focus:px-3.5 focus:py-2 focus:text-[13px] focus:font-medium focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        Skip to main content
      </a>

      {/* Ambient background for the translucent shell */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,var(--color-brand-100),transparent)] print:hidden"
        aria-hidden="true"
      />

      {/* Mobile Slide-Over Drawer Navigation */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
          className="fixed inset-0 z-40 lg:hidden print:hidden"
        >
          {/* Backdrop overlay with blur */}
          <div
            className="fixed inset-0 bg-ink-950/40 backdrop-blur-xs transition-opacity animate-fade"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer container */}
          <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white shadow-2xl animate-enter">
            <Sidebar
              userName={userName}
              userEmail={userEmail}
              storeName={storeName}
              isMobile={true}
            />
          </div>
        </div>
      )}

      {/* Desktop Persistent Sidebar (Collapsible) */}
      <div className="hidden lg:flex shrink-0 print:hidden">
        <Sidebar userName={userName} userEmail={userEmail} storeName={storeName} />
      </div>

      {/* Main Viewport Container */}
      <div className="flex min-w-0 flex-1 flex-col print:w-full print:block">
        <div className="print:hidden">
          <Topbar />
        </div>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto focus:outline-none print:overflow-visible print:p-0 print:m-0 print:block"
        >
          <div
            className={clsx(
              "mx-auto w-full transition-[max-width,padding] duration-150 print:p-0 print:m-0 print:max-w-none",
              isPosTerminal
                ? "max-w-none p-0"
                : "max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
            )}
          >
            {children}
          </div>
        </main>
      </div>

      {/* AIAssistant Interactive Panel (gated by ai.use) */}
      {permissions.includes("ai.use") && (
        <div className="print:hidden">
          <AIAssistant />
        </div>
      )}

      {/* Global Command Palette (Cmd+K) */}
      <CommandPalette />

      {/* Keyboard Shortcuts Cheat Sheet Modal */}
      <ShortcutsModal />

      {/* Floating Counter Calculator (F12 / Alt+F12) */}
      <CounterCalculator
        isOpen={calculatorOpen}
        onClose={() => setCalculatorOpen(false)}
      />
    </div>
  );
}

export function DashboardShell(props: DashboardShellProps) {
  return (
    <ShellProvider
      storeName={props.storeName}
      currentStore={props.currentStore}
      allowedStores={props.allowedStores}
      userName={props.userName}
      userEmail={props.userEmail}
      userId={props.userId}
      tenantId={props.tenantId}
      permissions={props.permissions}
    >
      <DashboardShellContent {...props} />
    </ShellProvider>
  );
}
