"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ChevronRight,
  HelpCircle,
  Plus,
  Search,
  Menu,
  WifiOff,
  ArrowLeftRight,
} from "lucide-react";
import { LogoMark } from "./ui";
import { useShell } from "./ShellContext";
import { NotificationsPopover } from "./NotificationsPopover";

const LABELS: Record<string, string> = {
  dashboard: "Overview",
  inventory: "Item master",
  batches: "Batches & stock",
  import: "Bulk import",
  purchases: "Purchases",
  sales: "Sales",
  pos: "New bill",
  accounting: "Accounting",
  suppliers: "Suppliers",
  customers: "Customers",
  settings: "Settings",
  new: "New",
};

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    toggleMobile,
    setCommandOpen,
    setShortcutsOpen,
    isOnline,
    currentStore,
  } = useShell();

  const isWarehouse = currentStore?.kind === "warehouse";

  // Global F2 shortcut for new POS bill (active retail counter only)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        if (!isWarehouse) {
          router.push("/dashboard/sales/pos");
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, isWarehouse]);

  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    href: "/" + segments.slice(0, i + 1).join("/"),
    label: LABELS[seg] ?? seg,
  }));

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 sm:gap-4 border-b border-ink-200/50 bg-white/60 px-3 sm:px-6 backdrop-blur-2xl print:hidden select-none">
      {/* Mobile Hamburger Menu Toggle */}
      <button
        type="button"
        onClick={toggleMobile}
        className="btn btn-ghost btn-icon lg:hidden text-ink-700"
        aria-label="Open mobile menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Brand logo mark on small screens */}
      <Link href="/dashboard" className="lg:hidden flex items-center" aria-label="Home">
        <LogoMark />
      </Link>

      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1 text-[13px]">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={c.href} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-300" />}
                {last ? (
                  <span className="truncate font-medium text-ink-900">{c.label}</span>
                ) : (
                  <Link
                    href={c.href}
                    className="truncate text-ink-500 transition-colors hover:text-ink-900"
                  >
                    {c.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Offline Status Sentinel Pill */}
      {!isOnline && (
        <div
          role="alert"
          className="flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-[11.5px] font-medium text-red-700 border border-red-200"
        >
          <WifiOff className="h-3.5 w-3.5 animate-pulse text-red-600" />
          <span className="hidden sm:inline">Offline Mode</span>
        </div>
      )}

      {/* Quick Search Trigger (Cmd+K) */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="flex h-8 w-9 sm:w-56 md:w-64 items-center justify-center sm:justify-start gap-2 rounded-md border border-ink-200 bg-ink-50/70 px-2 sm:px-2.5 text-[13px] text-ink-400 transition-colors hover:border-ink-300 hover:bg-white"
          title="Command Palette (Cmd+K)"
          aria-label="Search or type a command"
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-500" />
          <span className="hidden sm:inline flex-1 text-left truncate">
            Search or jump to…
          </span>
          <span className="kbd hidden sm:inline-flex text-[10px]">⌘K</span>
        </button>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-1">
        {/* Help & Shortcuts Button */}
        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          className="btn btn-ghost btn-icon text-ink-500 hover:text-ink-900"
          aria-label="Keyboard Shortcuts"
          title="Keyboard Shortcuts (?)"
        >
          <HelpCircle className="h-4 w-4" />
        </button>

        {/* Notifications Popover */}
        <NotificationsPopover />

        {/* New POS Bill Action (or Transfer Stock for Warehouse) */}
        {isWarehouse ? (
          <Link
            href="/dashboard/inventory/transfers/new"
            className="btn btn-primary btn-sm ml-1 shrink-0"
            title="Create Stock Transfer"
          >
            <ArrowLeftRight className="h-4 w-4" />
            <span className="hidden sm:inline">Transfer stock</span>
          </Link>
        ) : (
          <Link
            href="/dashboard/sales/pos"
            className="btn btn-primary btn-sm ml-1 shrink-0"
            title="New POS Bill (F2)"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New bill</span>
            <span className="kbd hidden md:inline-flex !border-white/20 !bg-white/10 !text-white/80 !shadow-none text-[10px]">
              F2
            </span>
          </Link>
        )}
      </div>
    </header>
  );
}
