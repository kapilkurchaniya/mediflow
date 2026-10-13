"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutGrid,
  ScanLine,
  Receipt,
  FileInput,
  Pill,
  Boxes,
  Upload,
  BookOpenText,
  Truck,
  Users,
  Settings,
  UserPlus,
  AlertTriangle,
  Sparkles,
  Keyboard,
  Sidebar as SidebarIcon,
  X,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { useShell } from "./ShellContext";
import clsx from "clsx";

interface CommandItem {
  id: string;
  category: "Navigation" | "Quick Actions";
  label: string;
  description?: string;
  icon: LucideIcon;
  shortcut?: string;
  action: () => void;
}

export function CommandPalette() {
  const {
    commandOpen,
    setCommandOpen,
    toggleCollapsed,
    setShortcutsOpen,
  } = useShell();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const navigateTo = (href: string) => {
    setCommandOpen(false);
    router.push(href);
  };

  const items: CommandItem[] = useMemo(
    () => [
      // Navigation
      {
        id: "nav-overview",
        category: "Navigation",
        label: "Overview",
        description: "Dashboard KPIs & recent activity",
        icon: LayoutGrid,
        action: () => navigateTo("/dashboard"),
      },
      {
        id: "nav-pos",
        category: "Navigation",
        label: "New bill (POS Terminal)",
        description: "High-speed retail counter billing",
        icon: ScanLine,
        shortcut: "F2",
        action: () => navigateTo("/dashboard/sales/pos"),
      },
      {
        id: "nav-sales",
        category: "Navigation",
        label: "Sales & invoices",
        description: "View invoice history & print receipts",
        icon: Receipt,
        action: () => navigateTo("/dashboard/sales"),
      },
      {
        id: "nav-purchases",
        category: "Navigation",
        label: "Purchases (GRN)",
        description: "Goods received notes & supplier invoices",
        icon: FileInput,
        action: () => navigateTo("/dashboard/purchases"),
      },
      {
        id: "nav-purchase-new",
        category: "Navigation",
        label: "Record purchase",
        description: "Post a new GRN entry",
        icon: FileInput,
        action: () => navigateTo("/dashboard/purchases/new"),
      },
      {
        id: "nav-inventory",
        category: "Navigation",
        label: "Item master",
        description: "Drug catalog, salts & HSN codes",
        icon: Pill,
        action: () => navigateTo("/dashboard/inventory"),
      },
      {
        id: "nav-batches",
        category: "Navigation",
        label: "Batches & stock",
        description: "Expiry dates, MRP, cost & quantities",
        icon: Boxes,
        action: () => navigateTo("/dashboard/inventory/batches"),
      },
      {
        id: "nav-near-expiry",
        category: "Navigation",
        label: "Near-expiry batches",
        description: "Batches expiring within 90 days",
        icon: AlertTriangle,
        action: () => navigateTo("/dashboard/inventory/batches?nearExpiry=true"),
      },
      {
        id: "nav-import",
        category: "Navigation",
        label: "Bulk import",
        description: "Upload medicine stock via CSV/Excel",
        icon: Upload,
        action: () => navigateTo("/dashboard/inventory/import"),
      },
      {
        id: "nav-accounting",
        category: "Navigation",
        label: "Accounting & GST",
        description: "Day book, ledgers & tax summaries",
        icon: BookOpenText,
        action: () => navigateTo("/dashboard/accounting"),
      },
      {
        id: "nav-customers",
        category: "Navigation",
        label: "Customers",
        description: "Directory & outstanding balances",
        icon: Users,
        action: () => navigateTo("/dashboard/customers"),
      },
      {
        id: "nav-customer-new",
        category: "Navigation",
        label: "Add customer",
        description: "Register patient or credit account",
        icon: UserPlus,
        action: () => navigateTo("/dashboard/customers/new"),
      },
      {
        id: "nav-suppliers",
        category: "Navigation",
        label: "Suppliers",
        description: "Wholesalers & distributors list",
        icon: Truck,
        action: () => navigateTo("/dashboard/suppliers"),
      },
      {
        id: "nav-settings",
        category: "Navigation",
        label: "Settings",
        description: "Store profile, GSTIN, printer & bills",
        icon: Settings,
        action: () => navigateTo("/dashboard/settings"),
      },

      // Quick Actions
      {
        id: "act-toggle-sidebar",
        category: "Quick Actions",
        label: "Toggle sidebar collapse",
        description: "Expand or minimize navigation rail",
        icon: SidebarIcon,
        shortcut: "Ctrl B",
        action: () => {
          setCommandOpen(false);
          toggleCollapsed();
        },
      },
      {
        id: "act-shortcuts",
        category: "Quick Actions",
        label: "Keyboard shortcuts cheat sheet",
        description: "Display all POS and navigation hotkeys",
        icon: Keyboard,
        shortcut: "?",
        action: () => {
          setCommandOpen(false);
          setShortcutsOpen(true);
        },
      },
      {
        id: "act-ai",
        category: "Quick Actions",
        label: "Ask MediFlow AI Assistant",
        description: "Live database queries & drug interactions",
        icon: Sparkles,
        shortcut: "Ctrl J",
        action: () => {
          setCommandOpen(false);
          // Trigger the AI launcher click
          const aiBtn = document.querySelector<HTMLButtonElement>(
            'button[aria-label="Open assistant"]'
          );
          if (aiBtn) aiBtn.click();
        },
      },
    ],
    [router, setCommandOpen, toggleCollapsed, setShortcutsOpen]
  );

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase().trim();
    return items.filter(
      (it) =>
        it.label.toLowerCase().includes(q) ||
        it.description?.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q)
    );
  }, [items, query]);

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when dialog opens
  useEffect(() => {
    if (commandOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandOpen]);

  // Keyboard navigation inside dialog
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev <= 0 ? (filteredItems.length || 1) - 1 : prev - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    }
  };

  if (!commandOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 md:p-20 bg-ink-950/40 backdrop-blur-xs animate-fade"
      onClick={() => setCommandOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-ink-150 bg-white shadow-2xl animate-enter"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-ink-150 px-4 py-3 bg-white">
          <Search className="h-4 w-4 shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-[14px] text-ink-900 placeholder:text-ink-400 focus:outline-none"
            placeholder="Type a command or jump to a module…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setCommandOpen(false)}
            className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[380px] overflow-y-auto p-2 space-y-1 divide-y-0"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[13px] text-ink-500 font-medium">No results found for &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-[12px] text-ink-400">Try searching for POS, batches, sales, or settings</p>
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              const Icon = item.icon;
              return (
                <div
                  key={item.id}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={clsx(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-left cursor-pointer transition-colors duration-100",
                    isSelected
                      ? "bg-brand-50/80 text-ink-900 ring-1 ring-brand-200/80"
                      : "text-ink-700 hover:bg-ink-50"
                  )}
                >
                  <div
                    className={clsx(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-md border",
                      isSelected
                        ? "border-brand-200 bg-white text-brand-700"
                        : "border-ink-150 bg-ink-50 text-ink-500"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium text-ink-900">
                        {item.label}
                      </span>
                      <span className="text-[11px] text-ink-400 font-mono uppercase tracking-wide">
                        {item.category}
                      </span>
                    </div>
                    {item.description && (
                      <p className="truncate text-[12px] text-ink-500">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {item.shortcut && (
                    <span className="kbd text-[10.5px] shrink-0">
                      {item.shortcut}
                    </span>
                  )}
                  {isSelected && (
                    <ArrowRight className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="flex items-center justify-between border-t border-ink-150 bg-ink-50/60 px-4 py-2 text-[11.5px] text-ink-500">
          <div className="flex items-center gap-2">
            <span>Navigate:</span>
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            <span>Select:</span>
            <span className="kbd">↵</span>
          </div>
          <div className="flex items-center gap-2">
            <span>Close:</span>
            <span className="kbd">Esc</span>
          </div>
        </div>
      </div>
    </div>
  );
}
