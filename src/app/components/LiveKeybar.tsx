"use client";

import React, { useEffect, useState } from "react";
import { getBindingsForScope, type ShortcutProfile, type ShortcutScope } from "@/lib/keyboard/keymap-registry";

export function LiveKeybar({
  scope,
  profile = "mediflow",
}: {
  scope: ShortcutScope;
  profile?: ShortcutProfile;
}) {
  const [altHeld, setAltHeld] = useState(false);
  const items = getBindingsForScope(scope, profile);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Alt" && !timer) {
        timer = setTimeout(() => setAltHeld(true), 600);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Alt") {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        setAltHeld(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="hidden lg:flex flex-wrap items-center gap-3 px-4 py-2 rounded-xl bg-ink-900 text-ink-100 text-[11px] font-mono shadow-xs">
      <span className="text-brand-300 font-bold uppercase tracking-wider">
        {profile === "marg" ? "Marg Classic" : "MediFlow Keys"}
      </span>
      {altHeld && (
        <span className="px-1.5 py-0.5 rounded bg-amber-400 text-ink-950 font-bold animate-pulse">
          KeyTips Active (Alt+K / Alt+L / Alt+P)
        </span>
      )}
      <span className="text-ink-600">|</span>
      {items.map((item) => (
        <span key={item.id} className="inline-flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 rounded bg-ink-800 border border-ink-700 text-white font-semibold">
            {item.keyLabel}
          </kbd>
          <span className="text-ink-300">{item.label}</span>
        </span>
      ))}
    </div>
  );
}
