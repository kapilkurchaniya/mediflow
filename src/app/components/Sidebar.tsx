"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutGrid,
  Pill,
  Boxes,
  FileInput,
  Receipt,
  ScanLine,
  BookOpenText,
  Truck,
  Users,
  Settings,
  LogOut,
  ChevronsUpDown,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./ui";
import { logoutAction } from "@/app/actions/auth";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; shortcut?: string };

const NAV: { heading?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true },
      { href: "/dashboard/sales/pos", label: "New bill", icon: ScanLine, shortcut: "F2" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { href: "/dashboard/sales", label: "Sales & invoices", icon: Receipt },
      { href: "/dashboard/purchases", label: "Purchases (GRN)", icon: FileInput },
    ],
  },
  {
    heading: "Inventory",
    items: [
      { href: "/dashboard/inventory", label: "Item master", icon: Pill, exact: true },
      { href: "/dashboard/inventory/batches", label: "Batches & stock", icon: Boxes },
      { href: "/dashboard/inventory/import", label: "Bulk import", icon: Upload },
    ],
  },
  {
    heading: "Finance",
    items: [{ href: "/dashboard/accounting", label: "Accounting", icon: BookOpenText }],
  },
  {
    heading: "Directory",
    items: [
      { href: "/dashboard/suppliers", label: "Suppliers", icon: Truck },
      { href: "/dashboard/customers", label: "Customers", icon: Users },
    ],
  },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href || pathname === `${item.href}/new`;
  if (item.href === "/dashboard/sales") return pathname === "/dashboard/sales";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function Sidebar({
  userName,
  userEmail,
  storeName,
}: {
  userName: string;
  userEmail: string;
  storeName: string;
}) {
  const pathname = usePathname();
  const letters = userName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <aside className="hidden lg:flex w-[248px] shrink-0 flex-col border-r border-ink-150 bg-ink-25">
      {/* Brand */}
      <div className="flex h-14 items-center px-4">
        <Link href="/dashboard" aria-label="MediFlow home">
          <Logo />
        </Link>
      </div>

      {/* Store switcher */}
      <div className="px-3 pb-2">
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-lg border border-ink-150 bg-white px-2.5 py-2 text-left shadow-xs transition-colors hover:border-ink-300"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink-900 text-[11px] font-semibold text-white">
            {storeName.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink-900">{storeName}</span>
            <span className="block text-[11.5px] text-ink-500">Main branch</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-ink-400" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-2" aria-label="Primary">
        {NAV.map((group, gi) => (
          <div key={gi} className={clsx(gi > 0 && "mt-5")}>
            {group.heading && (
              <p className="mb-1 px-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-400">
                {group.heading}
              </p>
            )}
            <ul className="space-y-px">
              {group.items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "group relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors duration-100",
                        active
                          ? "bg-white text-ink-900 font-medium shadow-xs ring-1 ring-ink-150"
                          : "text-ink-600 hover:bg-ink-100/70 hover:text-ink-900",
                      )}
                    >
                      <Icon
                        className={clsx(
                          "h-4 w-4 shrink-0",
                          active ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600",
                        )}
                        strokeWidth={active ? 2.2 : 1.9}
                      />
                      <span className="truncate">{item.label}</span>
                      {item.shortcut && <span className="kbd ml-auto">{item.shortcut}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-ink-150 p-3 space-y-px">
        <Link
          href="/dashboard/settings"
          className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-ink-600 transition-colors hover:bg-ink-100/70 hover:text-ink-900"
        >
          <Settings className="h-4 w-4 text-ink-400" strokeWidth={1.9} />
          Settings
        </Link>
        <div className="mt-2 flex items-center gap-2.5 rounded-md px-2 py-1.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-[12px] font-semibold text-brand-800">
            {letters || "U"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink-900">{userName}</p>
            <p className="truncate text-[11.5px] text-ink-500">{userEmail}</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost btn-icon" aria-label="Sign out" title="Sign out">
              <LogOut />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
