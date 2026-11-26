"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Sparkles,
  Keyboard,
  Calculator,
  Sidebar as SidebarIcon,
  X,
  ArrowRight,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { useShell } from "./ShellContext";
import { visiblePaletteItems } from "./nav";
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
    setCalculatorOpen,
    permissions,
    currentStore,
  } = useShell();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const navigateTo = useCallback(
    (href: string) => {
      setCommandOpen(false);
      router.push(href);
    },
    [router, setCommandOpen],
  );

  const items: CommandItem[] = useMemo(
    () => [
      // Navigation: generated from the same config as the sidebar (components/nav)
      ...visiblePaletteItems(permissions, currentStore?.kind).map(
        (n): CommandItem => ({
          id: `nav-${n.href}`,
          category: "Navigation",
          label: n.href === "/dashboard/sales/pos" ? "New bill (POS Terminal)" : n.label,
          description: n.description,
          icon: n.icon,
          shortcut: n.shortcut,
          action: () => navigateTo(n.href),
        }),
      ),

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
        id: "act-calculator",
        category: "Quick Actions",
        label: "Open Counter Calculator",
        description: "Fast in-counter math & percentages (calc)",
        icon: Calculator,
        shortcut: "F12",
        action: () => {
          setCommandOpen(false);
          setCalculatorOpen(true);
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
        id: "act-help",
        category: "Quick Actions",
        label: "Help Center & SOP Task Guides",
        description: "Task guides for first bill, returns, GST filing, and offline mode",
        icon: BookOpen,
        action: () => {
          setCommandOpen(false);
          router.push("/dashboard/help");
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
    [
      setCommandOpen,
      toggleCollapsed,
      setShortcutsOpen,
      setCalculatorOpen,
      permissions,
      currentStore?.kind,
      navigateTo,
    ],
  );

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase().trim();
    const aliasMap: Record<string, string[]> = {
      "control room": ["settings", "control-room", "policies"],
      "self format": ["printers", "templates", "billing"],
      "brk/exp": ["expiry", "quarantine", "returns"],
      "godown": ["batches", "racks", "transfers"],
      "tally": ["export", "accounting", "xml"],
      "jv": ["vouchers", "journal"],
      "contra": ["vouchers", "cash", "bank"],
      "pdc": ["cheque", "pdc"],
      "challan": ["wholesale", "dispatch"],
    };
    const expandedTerms = [q];
    for (const [alias, targets] of Object.entries(aliasMap)) {
      if (alias.includes(q) || q.includes(alias)) {
        expandedTerms.push(...targets);
      }
    }
    return items.filter((it) => {
      const hay = `${it.label} ${it.description ?? ""} ${it.category}`.toLowerCase();
      return expandedTerms.some((term) => hay.includes(term));
    });
  }, [items, query]);

  // Reset selected index when query changes (React recommended pattern: adjust state during render)
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    setSelectedIndex(0);
  }

  // Focus input and clear query when dialog opens
  useEffect(() => {
    if (commandOpen) {
      const timer = setTimeout(() => {
        setQuery("");
        setSelectedIndex(0);
        inputRef.current?.focus();
      }, 10);
      return () => clearTimeout(timer);
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
                      isSelected ? "border-brand-200 bg-white text-brand-700" : "border-ink-150 bg-ink-50 text-ink-500"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium text-ink-900">{item.label}</span>
                      <span className="text-[11px] text-ink-400 font-mono uppercase tracking-wide">{item.category}</span>
                    </div>
                    {item.description && <p className="truncate text-[12px] text-ink-500">{item.description}</p>}
                  </div>

                  {item.shortcut && <span className="kbd text-[10.5px] shrink-0">{item.shortcut}</span>}
                  {isSelected && <ArrowRight className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
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
