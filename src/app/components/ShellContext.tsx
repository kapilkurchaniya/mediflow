"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useSyncExternalStore, useRef } from "react";
import { usePathname } from "next/navigation";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
function getOnlineSnapshot() {
  return navigator.onLine;
}
function getServerSnapshot() {
  return true;
}

interface ShellContextType {
  // Mobile drawer state
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggleMobile: () => void;

  // Desktop sidebar collapsed state
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggleCollapsed: () => void;

  // Command palette state
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;

  // Shortcuts cheat sheet modal state
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;

  // Notifications popover state
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;

  // Network connection state
  isOnline: boolean;

  // Contextual info
  storeName: string;
  userName: string;
  userEmail: string;
  /** Permissions of the signed-in user; the sidebar and command palette hide what they may not use. */
  permissions: ReadonlySet<string>;
}

const ShellContext = createContext<ShellContextType | null>(null);

const STORAGE_KEY_COLLAPSED = "mediflow:sidebar-collapsed";

export function ShellProvider({
  children,
  storeName,
  userName,
  userEmail,
  permissions,
}: {
  children: React.ReactNode;
  storeName: string;
  userName: string;
  userEmail: string;
  permissions: readonly string[];
}) {
  const permissionSet = React.useMemo(() => new Set(permissions), [permissions]);
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsedState] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COLLAPSED);
      return saved !== null ? saved === "true" : false;
    } catch {
      return false;
    }
  });
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);

  const setCollapsed = useCallback((val: boolean) => {
    setCollapsedState(val);
    try {
      localStorage.setItem(STORAGE_KEY_COLLAPSED, String(val));
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY_COLLAPSED, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const toggleMobile = useCallback(() => setMobileOpen((o) => !o), []);

  // Close mobile drawer and popovers on route change
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setMobileOpen(false);
      setNotificationsOpen(false);
    }
  }, [pathname]);

  // Global keyboard shortcuts (Cmd+K, Ctrl+B, ?, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);

      // Cmd+K or Ctrl+K -> Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
        return;
      }

      // Ctrl+B -> Toggle Sidebar Collapse
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
        return;
      }

      // '?' key (Shift + /) -> Shortcuts cheat sheet
      if (!isInput && e.key === "?" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
        return;
      }

      // Escape -> close any open modal
      if (e.key === "Escape") {
        if (commandOpen) setCommandOpen(false);
        if (shortcutsOpen) setShortcutsOpen(false);
        if (notificationsOpen) setNotificationsOpen(false);
        if (mobileOpen) setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandOpen, shortcutsOpen, notificationsOpen, mobileOpen, toggleCollapsed]);

  return (
    <ShellContext.Provider
      value={{
        mobileOpen,
        setMobileOpen,
        toggleMobile,
        collapsed,
        setCollapsed,
        toggleCollapsed,
        commandOpen,
        setCommandOpen,
        shortcutsOpen,
        setShortcutsOpen,
        notificationsOpen,
        setNotificationsOpen,
        isOnline,
        storeName,
        userName,
        userEmail,
        permissions: permissionSet,
      }}
    >
      {children}
    </ShellContext.Provider>
  );
}

export function useShell() {
  const context = useContext(ShellContext);
  if (!context) {
    throw new Error("useShell must be used within a ShellProvider");
  }
  return context;
}
