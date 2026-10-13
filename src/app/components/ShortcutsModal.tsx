"use client";

import React from "react";
import { X, Keyboard, ScanLine, Search, Layout, Sparkles } from "lucide-react";
import { useShell } from "./ShellContext";

interface ShortcutGroup {
  title: string;
  icon: React.ReactNode;
  shortcuts: { key: string; label: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Billing & Counter POS",
    icon: <ScanLine className="h-4 w-4 text-brand-600" />,
    shortcuts: [
      { key: "F2", label: "Open POS New Bill counter" },
      { key: "/", label: "Focus medicine search input" },
      { key: "Esc", label: "Clear search / cancel action" },
    ],
  },
  {
    title: "Navigation & Command Menu",
    icon: <Search className="h-4 w-4 text-sky-600" />,
    shortcuts: [
      { key: "Cmd/Ctrl + K", label: "Open global command palette" },
      { key: "Ctrl + B", label: "Toggle sidebar collapse" },
      { key: "?", label: "Open keyboard shortcuts cheat sheet" },
      { key: "Esc", label: "Close active modal / drawer" },
    ],
  },
  {
    title: "MediFlow AI Assistant",
    icon: <Sparkles className="h-4 w-4 text-purple-600" />,
    shortcuts: [
      { key: "Ctrl + J", label: "Open/close MediFlow AI assistant" },
      { key: "Enter", label: "Submit query to assistant" },
    ],
  },
  {
    title: "General Ergonomics",
    icon: <Layout className="h-4 w-4 text-amber-600" />,
    shortcuts: [
      { key: "Tab", label: "Cycle through fields & buttons" },
      { key: "Shift + Tab", label: "Cycle backwards" },
      { key: "Space / Enter", label: "Activate selected control" },
    ],
  },
];

export function ShortcutsModal() {
  const { shortcutsOpen, setShortcutsOpen } = useShell();

  if (!shortcutsOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/40 backdrop-blur-xs animate-fade"
      onClick={() => setShortcutsOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-ink-150 bg-white shadow-2xl animate-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-ink-150 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink-100 text-ink-800">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-ink-900 leading-none">
                Keyboard Shortcuts
              </h2>
              <p className="mt-1 text-[12px] text-ink-500">
                Speed up counter sales and navigation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShortcutsOpen(false)}
            className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[460px] overflow-y-auto p-5 space-y-5">
          {SHORTCUT_GROUPS.map((group, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-700 uppercase tracking-wider">
                {group.icon}
                <span>{group.title}</span>
              </div>
              <div className="divide-y divide-ink-100 rounded-lg border border-ink-150 bg-ink-25/50 overflow-hidden">
                {group.shortcuts.map((sc, sIdx) => (
                  <div
                    key={sIdx}
                    className="flex items-center justify-between px-3.5 py-2.5 text-[13px]"
                  >
                    <span className="text-ink-700">{sc.label}</span>
                    <span className="kbd font-mono text-[11px]">{sc.key}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-ink-150 bg-ink-50/70 px-5 py-3 text-right">
          <button
            type="button"
            onClick={() => setShortcutsOpen(false)}
            className="btn btn-secondary btn-sm"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
