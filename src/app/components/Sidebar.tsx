"use client";

import React, { useState } from "react";
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
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Check,
  Building2,
  ShieldAlert,
  FileText,
  Stethoscope,
  BarChart3,
  Landmark,
  ReceiptText,
  QrCode,
  FileSpreadsheet,
  BookmarkCheck,
  Layers,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { Logo, LogoMark } from "./ui";
import { logoutAction } from "@/app/actions/auth";
import { useShell } from "./ShellContext";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  shortcut?: string;
};

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
      { href: "/dashboard/sales/promise-orders", label: "Promise orders", icon: BookmarkCheck },
    ],
  },
  {
    heading: "Compliance (Rx)",
    items: [
      { href: "/dashboard/compliance", label: "Drug registers", icon: ShieldAlert, exact: true },
      { href: "/dashboard/compliance/schedule-h1", label: "Schedule H1 (Form 35)", icon: ShieldAlert },
      { href: "/dashboard/compliance/prescriptions", label: "Prescriptions (Rx)", icon: FileText },
      { href: "/dashboard/compliance/doctors", label: "Doctor master", icon: Stethoscope },
    ],
  },
  {
    heading: "Inventory",
    items: [
      { href: "/dashboard/inventory", label: "Item master", icon: Pill, exact: true },
      { href: "/dashboard/inventory/batches", label: "Batches & stock", icon: Boxes },
      { href: "/dashboard/settings/racks", label: "Racks & shelves", icon: Layers },
      { href: "/dashboard/settings/schemes", label: "Trade schemes", icon: Tag },
      { href: "/dashboard/inventory/import", label: "Bulk import", icon: Upload },
    ],
  },
  {
    heading: "GST & Tax",
    items: [
      { href: "/dashboard/gst", label: "GST Overview", icon: Landmark, exact: true },
      { href: "/dashboard/gst/outward", label: "Outward (GSTR-1)", icon: ReceiptText },
      { href: "/dashboard/gst/inward", label: "Inward (ITC)", icon: FileSpreadsheet },
      { href: "/dashboard/gst/e-invoice", label: "E-Invoice & E-Way", icon: QrCode },
      { href: "/dashboard/gst/returns", label: "Returns & Filing", icon: Landmark },
    ],
  },
  {
    heading: "Finance",
    items: [
      { href: "/dashboard/accounting", label: "Accounting", icon: BookOpenText },
      { href: "/dashboard/reports", label: "Reports & Analytics", icon: BarChart3 },
    ],
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
  isMobile = false,
}: {
  userName: string;
  userEmail: string;
  storeName: string;
  isMobile?: boolean;
}) {
  const pathname = usePathname();
  const { collapsed, toggleCollapsed, setMobileOpen } = useShell();
  const [showStoreMenu, setShowStoreMenu] = useState(false);

  const letters = userName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const isCollapsed = !isMobile && collapsed;

  return (
    <aside
      className={clsx(
        "flex flex-col border-r border-ink-200/50 bg-white/60 backdrop-blur-2xl transition-[width] duration-200 print:hidden select-none",
        isMobile
          ? "w-full h-full"
          : isCollapsed
          ? "w-[68px]"
          : "w-[240px]"
      )}
    >
      {/* Brand Header */}
      <div className="flex h-14 items-center justify-between px-3.5 border-b border-ink-150/40">
        <Link
          href="/dashboard"
          aria-label="MediFlow home"
          className="flex items-center gap-2 overflow-hidden"
          onClick={() => isMobile && setMobileOpen(false)}
        >
          {isCollapsed ? <LogoMark /> : <Logo />}
        </Link>

        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="btn btn-ghost btn-icon"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="btn btn-ghost btn-icon text-ink-400 hover:text-ink-700"
            title={isCollapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
            aria-label="Toggle sidebar"
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Store Switcher */}
      <div className="relative px-2.5 py-2">
        <button
          type="button"
          onClick={() => setShowStoreMenu(!showStoreMenu)}
          title={isCollapsed ? storeName : undefined}
          className={clsx(
            "flex w-full items-center gap-2 rounded-lg border border-ink-150 bg-white px-2 py-1.5 text-left shadow-xs transition-colors hover:border-ink-300",
            isCollapsed && "justify-center px-1"
          )}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink-900 text-[11px] font-semibold text-white">
            {storeName.slice(0, 1).toUpperCase()}
          </span>
          {!isCollapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-ink-900 leading-tight">
                  {storeName}
                </span>
                <span className="block text-[11px] text-ink-500">Main branch</span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-ink-400 shrink-0" />
            </>
          )}
        </button>

        {/* Store popup info */}
        {showStoreMenu && (
          <div className="absolute left-2.5 right-2.5 top-full mt-1 z-30 rounded-lg border border-ink-150 bg-white p-2.5 shadow-lg text-[12.5px] animate-enter">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-ink-100">
              <span className="font-semibold text-ink-900">Branch Details</span>
              <span className="badge badge-success !h-4.5 !text-[10px]">Active</span>
            </div>
            <div className="space-y-1.5 text-ink-600">
              <div className="flex items-center gap-1.5 text-ink-800 font-medium">
                <Building2 className="h-3.5 w-3.5 text-brand-600" />
                <span className="truncate">{storeName}</span>
                <Check className="h-3.5 w-3.5 text-brand-600 ml-auto" />
              </div>
              <p className="text-[11px] text-ink-500">Drug License: DL-20B/21B Active</p>
              <p className="text-[11px] text-ink-500">GSTIN Registered: Active</p>
            </div>
            <button
              type="button"
              onClick={() => setShowStoreMenu(false)}
              className="mt-2 w-full text-center text-[11.5px] text-brand-600 hover:text-brand-700 font-medium pt-1 border-t border-ink-100"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-1 space-y-4" aria-label="Primary">
        {NAV.map((group, gi) => (
          <div key={gi} className="space-y-1">
            {group.heading && !isCollapsed && (
              <p className="px-2 text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-400 mb-1">
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
                      onClick={() => isMobile && setMobileOpen(false)}
                      title={isCollapsed ? `${item.label} ${item.shortcut ? `(${item.shortcut})` : ""}` : undefined}
                      aria-current={active ? "page" : undefined}
                      className={clsx(
                        "group relative flex h-8.5 items-center rounded-md text-[13px] transition-colors duration-100",
                        isCollapsed ? "justify-center px-0 w-full" : "gap-2.5 px-2.5",
                        active
                          ? "bg-white text-ink-900 font-medium shadow-xs ring-1 ring-ink-150"
                          : "text-ink-600 hover:bg-ink-100/70 hover:text-ink-900"
                      )}
                    >
                      <Icon
                        className={clsx(
                          "h-4 w-4 shrink-0",
                          active ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600"
                        )}
                        strokeWidth={active ? 2.2 : 1.9}
                      />
                      {!isCollapsed && (
                        <>
                          <span className="truncate">{item.label}</span>
                          {item.shortcut && (
                            <span className="kbd ml-auto text-[10px]">{item.shortcut}</span>
                          )}
                        </>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer Profile & Settings */}
      <div className="border-t border-ink-150/70 p-2.5 space-y-1">
        <Link
          href="/dashboard/settings"
          onClick={() => isMobile && setMobileOpen(false)}
          title={isCollapsed ? "Settings" : undefined}
          className={clsx(
            "flex h-8 items-center rounded-md text-[13px] text-ink-600 transition-colors hover:bg-ink-100/70 hover:text-ink-900",
            isCollapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
          )}
        >
          <Settings className="h-4 w-4 text-ink-400" strokeWidth={1.9} />
          {!isCollapsed && <span>Settings</span>}
        </Link>

        <div
          className={clsx(
            "flex items-center rounded-md py-1.5 transition-colors",
            isCollapsed ? "justify-center px-0" : "gap-2 px-1.5"
          )}
        >
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-100 text-[11px] font-semibold text-brand-800"
            title={isCollapsed ? `${userName} (${userEmail})` : undefined}
          >
            {letters || "U"}
          </span>
          {!isCollapsed && (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-ink-900 leading-tight">
                  {userName}
                </p>
                <p className="truncate text-[11px] text-ink-500">{userEmail}</p>
              </div>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="btn btn-ghost btn-icon h-7 w-7 text-ink-400 hover:text-red-600"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
