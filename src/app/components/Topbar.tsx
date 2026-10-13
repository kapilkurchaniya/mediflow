"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Bell, ChevronRight, HelpCircle, Plus, Search } from "lucide-react";
import { LogoMark } from "./ui";

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

  // Global keyboard shortcuts used by counter staff.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (e.key === "F2") {
        e.preventDefault();
        router.push("/dashboard/sales/pos");
      } else if (!typing && e.key === "/" ) {
        const el = document.querySelector<HTMLInputElement>('input[type="search"]');
        if (el) {
          e.preventDefault();
          el.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((seg, i) => ({
    href: "/" + segments.slice(0, i + 1).join("/"),
    label: LABELS[seg] ?? seg,
  }));

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b border-ink-200/50 bg-white/40 px-4 backdrop-blur-2xl sm:px-6 print:hidden">
      <Link href="/dashboard" className="lg:hidden" aria-label="Home">
        <LogoMark />
      </Link>

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
                  <Link href={c.href} className="truncate text-ink-500 transition-colors hover:text-ink-900">
                    {c.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="hidden md:flex items-center">
        <button
          type="button"
          onClick={() => document.querySelector<HTMLInputElement>('input[type="search"]')?.focus()}
          className="flex h-8 w-64 items-center gap-2 rounded-md border border-ink-200 bg-ink-50/60 px-2.5 text-[13px] text-ink-400 transition-colors hover:border-ink-300 hover:bg-white"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search…</span>
          <span className="kbd">/</span>
        </button>
      </div>

      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Help">
          <HelpCircle />
        </button>
        <button type="button" className="btn btn-ghost btn-icon relative" aria-label="Notifications">
          <Bell />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
        </button>
        <Link href="/dashboard/sales/pos" className="btn btn-primary btn-sm ml-1.5">
          <Plus />
          <span className="hidden sm:inline">New bill</span>
          <span className="kbd hidden sm:inline-flex !border-white/20 !bg-white/10 !text-white/80 !shadow-none">F2</span>
        </Link>
      </div>
    </header>
  );
}
