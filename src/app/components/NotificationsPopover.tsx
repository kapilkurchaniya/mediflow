"use client";

import React, { useRef, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  CalendarClock,
  PackageOpen,
  ArrowRight,
  CheckCheck,
  CheckCircle2,
} from "lucide-react";
import { useShell } from "./ShellContext";
import clsx from "clsx";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: "warning" | "danger" | "info";
  href: string;
  read: boolean;
}

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Near Expiry Alert",
    message: "Batches expiring within ≤ 90 days. Check stock before dispensing.",
    time: "Today",
    type: "danger",
    href: "/dashboard/inventory/batches?nearExpiry=true",
    read: false,
  },
  {
    id: "notif-2",
    title: "Low Stock Warning",
    message: "Fast-moving items at or below reorder level. Review purchase needs.",
    time: "Today",
    type: "warning",
    href: "/dashboard/inventory/batches",
    read: false,
  },
  {
    id: "notif-3",
    title: "GST Compliance & Day Book",
    message: "Daily sales and cash counter register ready for reconciliation.",
    time: "Yesterday",
    type: "info",
    href: "/dashboard/accounting",
    read: true,
  },
];

export function NotificationsPopover() {
  const { notificationsOpen, setNotificationsOpen } = useShell();
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const popoverRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const markItemRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  // Close on click outside
  useEffect(() => {
    if (!notificationsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [notificationsOpen, setNotificationsOpen]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setNotificationsOpen(!notificationsOpen)}
        className={clsx(
          "btn btn-ghost btn-icon relative",
          notificationsOpen && "bg-ink-100 text-ink-900"
        )}
        aria-label="Notifications"
        aria-expanded={notificationsOpen}
        data-tooltip-title="Store Alerts & Notifications"
        data-tooltip="View near-expiry batch warnings, low-stock reorder alerts, and compliance reminders."
        data-tooltip-placement="bottom"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
          </span>
        )}
      </button>

      {notificationsOpen && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-ink-150 bg-white shadow-xl z-50 overflow-hidden animate-enter"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ink-150 px-4 py-3 bg-white">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-ink-900">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="badge badge-brand !h-5 !text-[11px]">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="flex items-center gap-1 text-[12px] font-medium text-brand-600 hover:text-brand-700 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-ink-100">
            {notifications.map((item) => {
              const icon =
                item.type === "danger" ? (
                  <CalendarClock className="h-4 w-4 text-red-600" />
                ) : item.type === "warning" ? (
                  <PackageOpen className="h-4 w-4 text-amber-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-sky-600" />
                );

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    markItemRead(item.id);
                    setNotificationsOpen(false);
                  }}
                  className={clsx(
                    "flex items-start gap-3 p-3.5 transition-colors hover:bg-ink-50",
                    !item.read ? "bg-brand-50/20" : "bg-white"
                  )}
                >
                  <div
                    className={clsx(
                      "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border",
                      item.type === "danger"
                        ? "border-red-200 bg-red-50"
                        : item.type === "warning"
                        ? "border-amber-200 bg-amber-50"
                        : "border-sky-200 bg-sky-50"
                    )}
                  >
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="truncate text-[13px] font-medium text-ink-900">
                        {item.title}
                      </p>
                      <span className="text-[11px] text-ink-400 shrink-0">
                        {item.time}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] text-ink-600 line-clamp-2">
                      {item.message}
                    </p>
                  </div>
                  {!item.read && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                  )}
                </Link>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-ink-150 bg-ink-50/60 p-2.5 text-center">
            <Link
              href="/dashboard/inventory/batches?nearExpiry=true"
              onClick={() => setNotificationsOpen(false)}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-700 hover:text-brand-600 transition-colors"
            >
              <span>View all inventory alerts</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
