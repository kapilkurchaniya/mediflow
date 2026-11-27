"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  PackageOpen,
  RefreshCw,
} from "lucide-react";
import clsx from "clsx";
import { useShell } from "./ShellContext";
import { getStoreNotificationsAction } from "@/app/actions/notifications";
import type { StoreAlertItem } from "@/server/domain/notifications/alerts";

const READ_FPS_STORAGE_KEY = "mediflow_read_alert_fps";

function loadReadFingerprints(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(READ_FPS_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function saveReadFingerprints(fps: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READ_FPS_STORAGE_KEY, JSON.stringify([...fps].slice(-50)));
  } catch {
    // ignore storage errors
  }
}

export function NotificationsPopover() {
  const { notificationsOpen, setNotificationsOpen } = useShell();
  const [items, setItems] = useState<StoreAlertItem[]>([]);
  const [readFps, setReadFps] = useState<Set<string>>(() => loadReadFingerprints());
  const [loading, setLoading] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const refreshAlerts = useCallback(() => {
    setLoading(true);
    getStoreNotificationsAction()
      .then((alerts) => {
        setItems(alerts);
      })
      .catch(() => {
        // Ignore transient background fetch failures
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    let active = true;
    getStoreNotificationsAction()
      .then((alerts) => {
        if (active) setItems(alerts);
      })
      .catch(() => {
        // Ignore initial load error
      });
    return () => {
      active = false;
    };
  }, []);

  const notifications = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        read: readFps.has(item.fingerprint),
      })),
    [items, readFps],
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    const next = new Set(readFps);
    for (const item of items) next.add(item.fingerprint);
    setReadFps(next);
    saveReadFingerprints(next);
  };

  const markItemRead = (fp: string) => {
    const next = new Set(readFps);
    next.add(fp);
    setReadFps(next);
    saveReadFingerprints(next);
  };

  useEffect(() => {
    if (!notificationsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
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
        onClick={() => {
          const next = !notificationsOpen;
          setNotificationsOpen(next);
          if (next) refreshAlerts();
        }}
        className={clsx(
          "btn btn-ghost btn-icon relative",
          notificationsOpen && "bg-ink-100 text-ink-900",
        )}
        aria-label="Notifications"
        aria-expanded={notificationsOpen}
        data-tooltip-title="Store Alerts & Notifications"
        data-tooltip="Live low-stock reorder alerts, near-expiry warnings, Udhaar dues, and PDC alerts."
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
          <div className="flex items-center justify-between border-b border-ink-150 px-4 py-3 bg-white">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-ink-900">Store Alerts</span>
              {unreadCount > 0 && (
                <span className="badge badge-brand !h-5 !text-[11px]">{unreadCount} new</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={refreshAlerts}
                disabled={loading}
                className="p-1 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
                title="Refresh store alerts"
              >
                <RefreshCw className={clsx("h-3.5 w-3.5", loading && "animate-spin")} />
              </button>
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
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-ink-100">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-500 space-y-1">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 mx-auto" />
                <div className="font-medium text-ink-800">All caught up</div>
                <div>No active low-stock, expiry, or pending alerts for this store.</div>
              </div>
            ) : (
              notifications.map((item) => {
                const icon =
                  item.id.includes("expiry") ? (
                    <CalendarClock className="h-4 w-4 text-red-600" />
                  ) : item.type === "danger" ? (
                    <AlertTriangle className="h-4 w-4 text-red-600" />
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
                      markItemRead(item.fingerprint);
                      setNotificationsOpen(false);
                    }}
                    className={clsx(
                      "flex items-start gap-3 p-3.5 transition-colors hover:bg-ink-50",
                      !item.read ? "bg-brand-50/20" : "bg-white",
                    )}
                  >
                    <div
                      className={clsx(
                        "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border",
                        item.type === "danger"
                          ? "border-red-200 bg-red-50"
                          : item.type === "warning"
                            ? "border-amber-200 bg-amber-50"
                            : "border-sky-200 bg-sky-50",
                      )}
                    >
                      {icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-[13px] font-medium text-ink-900">{item.title}</p>
                        <span className="text-[11px] text-ink-400 shrink-0">{item.time}</span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-ink-600 line-clamp-2">{item.message}</p>
                    </div>
                    {!item.read && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                    )}
                  </Link>
                );
              })
            )}
          </div>

          <div className="border-t border-ink-150 bg-ink-50/60 p-2.5 flex items-center justify-between px-4">
            <Link
              href="/dashboard/purchases/reorder?onlyBelowMin=true"
              onClick={() => setNotificationsOpen(false)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline"
            >
              <span>Reorder Alerts</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              href="/dashboard/inventory/batches?nearExpiry=true"
              onClick={() => setNotificationsOpen(false)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-700 hover:text-brand-600"
            >
              <span>Expiry List</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
