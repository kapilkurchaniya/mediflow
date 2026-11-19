"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useSyncExternalStore, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AllowedStoreItem } from "@/server/domain/stores";

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

  // Floating counter calculator state (F12 / Alt+F12)
  calculatorOpen: boolean;
  setCalculatorOpen: (open: boolean) => void;
  toggleCalculator: () => void;

  // Notifications popover state
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;

  // Store switcher modal state (Ctrl+Shift+S)
  storeSwitcherOpen: boolean;
  setStoreSwitcherOpen: (open: boolean) => void;

  // Global feature tooltips state
  tooltipsEnabled: boolean;
  setTooltipsEnabled: (enabled: boolean) => void;
  toggleTooltips: () => void;

  // Network connection state
  isOnline: boolean;

  // Contextual info
  storeName: string;
  currentStore: AllowedStoreItem | null;
  allowedStores: AllowedStoreItem[];
  userName: string;
  userEmail: string;
  userId?: string;
  tenantId?: string | null;
  /** Permissions of the signed-in user; the sidebar and command palette hide what they may not use. */
  permissions: ReadonlySet<string>;
}

const ShellContext = createContext<ShellContextType | null>(null);

const STORAGE_KEY_COLLAPSED = "mediflow:sidebar-collapsed";
export const STORAGE_KEY_TOOLTIPS = "mediflow:tooltips-enabled";

export function ShellProvider({
  children,
  storeName,
  currentStore = null,
  allowedStores = [],
  userName,
  userEmail,
  userId,
  tenantId,
  permissions,
}: {
  children: React.ReactNode;
  storeName: string;
  currentStore?: AllowedStoreItem | null;
  allowedStores?: AllowedStoreItem[];
  userName: string;
  userEmail: string;
  userId?: string;
  tenantId?: string | null;
  permissions: readonly string[];
}) {
  const permissionSet = React.useMemo(() => new Set(permissions), [permissions]);
  const pathname = usePathname();
  const router = useRouter();
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
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [storeSwitcherOpen, setStoreSwitcherOpen] = useState(false);
  const [tooltipsEnabled, setTooltipsEnabledState] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TOOLTIPS);
      return saved !== null ? saved !== "false" : true;
    } catch {
      return true;
    }
  });
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerSnapshot);

  const toggleCalculator = useCallback(() => setCalculatorOpen((o) => !o), []);

  const setTooltipsEnabled = useCallback((val: boolean) => {
    setTooltipsEnabledState(val);
    try {
      localStorage.setItem(STORAGE_KEY_TOOLTIPS, String(val));
    } catch {
      // ignore
    }
  }, []);

  const toggleTooltips = useCallback(() => {
    setTooltipsEnabledState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY_TOOLTIPS, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

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
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
        return;
      }

      // Ctrl+Shift+S -> Open Store Switcher
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setStoreSwitcherOpen((o) => !o);
        return;
      }

      // '?' key (Shift + /) or Ctrl + F1 -> Shortcuts cheat sheet
      if ((!isInput && e.key === "?" && !e.ctrlKey && !e.metaKey) || (e.ctrlKey && (e.key === "F1" || e.key === "f1"))) {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
        return;
      }

      // F12 or Alt + F12 -> Floating Counter Calculator
      if (e.key === "F12" || (e.altKey && e.key === "F12")) {
        e.preventDefault();
        setCalculatorOpen((o) => !o);
        return;
      }

      // Alt + [Key] -> Global ERP Hotkeys
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === "n") {
          e.preventDefault();
          if (currentStore?.kind === "warehouse") {
            router.push("/dashboard/inventory/transfers/new");
          } else {
            router.push("/dashboard/sales/pos");
          }
          return;
        }
        if (k === "p") {
          e.preventDefault();
          router.push("/dashboard/purchasing/bills/new");
          return;
        }
        if (k === "m") {
          e.preventDefault();
          if (currentStore?.kind !== "warehouse") {
            router.push("/dashboard/sales/register");
          }
          return;
        }
        if (k === "i") {
          e.preventDefault();
          router.push("/dashboard/inventory");
          return;
        }
        if (k === "l") {
          e.preventDefault();
          router.push("/dashboard/crm/customers");
          return;
        }
      }

      // Escape -> close any open modal
      if (e.key === "Escape") {
        if (commandOpen) setCommandOpen(false);
        if (shortcutsOpen) setShortcutsOpen(false);
        if (calculatorOpen) setCalculatorOpen(false);
        if (notificationsOpen) setNotificationsOpen(false);
        if (storeSwitcherOpen) setStoreSwitcherOpen(false);
        if (mobileOpen) setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [commandOpen, shortcutsOpen, calculatorOpen, notificationsOpen, storeSwitcherOpen, mobileOpen, toggleCollapsed, router, currentStore?.kind]);

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
        calculatorOpen,
        setCalculatorOpen,
        toggleCalculator,
        notificationsOpen,
        setNotificationsOpen,
        storeSwitcherOpen,
        setStoreSwitcherOpen,
        tooltipsEnabled,
        setTooltipsEnabled,
        toggleTooltips,
        isOnline,
        storeName,
        currentStore,
        allowedStores,
        userName,
        userEmail,
        userId,
        tenantId,
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
