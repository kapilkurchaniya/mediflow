"use client";

import React from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Settings,
  LogOut,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { Logo, LogoMark } from "./ui";
import { logoutAction } from "@/app/actions/auth";
import { useShell } from "./ShellContext";
import { visibleNav, settingsItem, type NavItem } from "./nav";

function NavPendingIndicator() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden="true"
      className="ml-auto h-3 w-3 shrink-0 rounded-full border-2 border-brand-600 border-t-transparent animate-spin"
    />
  );
}

function matches(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href || pathname === `${item.href}/new`;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function isNavItemActive(
  pathname: string,
  item: NavItem,
  allItems: readonly NavItem[]
): boolean {
  if (!matches(pathname, item)) return false;
  return !allItems.some(
    (other) => other !== item && other.href.length > item.href.length && matches(pathname, other)
  );
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
  const {
    collapsed,
    toggleCollapsed,
    setMobileOpen,
    permissions,
    currentStore,
    setStoreSwitcherOpen,
  } = useShell();
  const nav = visibleNav(permissions, currentStore?.kind);
  const allNavItems = nav.flatMap((group) => group.items);
  const showSettings = !settingsItem.permission || permissions.has(settingsItem.permission);

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

      {/* Store Switcher Trigger */}
      <div className="relative px-2.5 py-2">
        <button
          type="button"
          onClick={() => setStoreSwitcherOpen(true)}
          title={isCollapsed ? (currentStore?.name ?? storeName) : "Switch branch or warehouse (Ctrl+Shift+S)"}
          className={clsx(
            "flex w-full items-center gap-2 rounded-lg border border-ink-150 bg-white px-2 py-1.5 text-left shadow-xs transition-colors hover:border-ink-300 hover:bg-ink-50/50",
            isCollapsed && "justify-center px-1"
          )}
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink-900 text-[11px] font-semibold text-white uppercase">
            {currentStore ? currentStore.code.slice(0, 2) : storeName.slice(0, 1)}
          </span>
          {!isCollapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium text-ink-900 leading-tight">
                  {currentStore?.name ?? storeName}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-ink-500">
                  <span className="capitalize">{currentStore?.kind ?? "retail"}</span>
                  {currentStore?.code && <span>• [{currentStore.code}]</span>}
                </span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-ink-400 shrink-0" />
            </>
          )}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-1 space-y-4" aria-label="Primary">
        {nav.map((group, gi) => (
          <div key={gi} className="space-y-1">
            {group.heading && !isCollapsed && (
              <p className="px-2 text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-400 mb-1">
                {group.heading}
              </p>
            )}
            <ul className="space-y-px">
              {group.items.map((item) => {
                const active = isNavItemActive(pathname, item, allNavItems);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={item.href === "/dashboard/sales/pos" || item.href === "/dashboard" ? undefined : false}
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
                          {item.badge && (
                            <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              {item.badge}
                            </span>
                          )}
                          <NavPendingIndicator />
                          {item.shortcut && !item.badge && (
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
        {showSettings && (
          <Link
            href={settingsItem.href}
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
        )}

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
              <Link href="/dashboard/settings/profile" className="min-w-0 flex-1 rounded hover:bg-ink-50" title="My profile and password">
                <p className="truncate text-[12.5px] font-medium text-ink-900 leading-tight">
                  {userName}
                </p>
                <p className="truncate text-[11px] text-ink-500">{userEmail}</p>
              </Link>
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
