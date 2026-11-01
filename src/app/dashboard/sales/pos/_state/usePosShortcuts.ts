"use client";

import { useEffect } from "react";

export interface ShortcutHandlers {
  onFocusSearch?: () => void;
  onResetSale?: () => void;
  onOpenSubstitutes?: () => void;
  onOpenRegister?: () => void;
  onHoldBill?: () => void;
  onListHeldBills?: () => void;
  onOpenPaymentModal?: () => void;
  onOpenPromiseModal?: () => void;
  onCompleteSale?: () => void;
  onOpenCalculator?: () => void;
  onOpenShortcutsCheatSheet?: () => void;
  onEscape?: () => void;
}

export function usePosShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isInput =
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.tagName === "SELECT";

      // Ctrl + F1 -> Shortcut Cheat Sheet
      if (e.ctrlKey && (e.key === "F1" || e.key === "f1")) {
        e.preventDefault();
        handlers.onOpenShortcutsCheatSheet?.();
        return;
      }

      // Function keys F2-F12, Insert, End, and / are reserved for Marg counter operations
      switch (e.key) {
        case "Insert":
          e.preventDefault();
          handlers.onFocusSearch?.();
          break;
        case "End":
          // Classic Marg ERP bill save
          if (!isInput) {
            e.preventDefault();
            handlers.onCompleteSale?.();
          }
          break;
        case "F2":
          e.preventDefault();
          if (handlers.onResetSale) {
            handlers.onResetSale();
          } else {
            handlers.onFocusSearch?.();
          }
          break;
        case "F3":
          e.preventDefault();
          handlers.onFocusSearch?.();
          break;
        case "/":
          if (!isInput) {
            e.preventDefault();
            handlers.onFocusSearch?.();
          }
          break;
        case "F4":
          e.preventDefault();
          handlers.onOpenRegister?.();
          break;
        case "F6":
          e.preventDefault();
          handlers.onHoldBill?.();
          break;
        case "F7":
          e.preventDefault();
          handlers.onListHeldBills?.();
          break;
        case "F8":
          e.preventDefault();
          handlers.onOpenPaymentModal?.();
          break;
        case "F9":
          e.preventDefault();
          handlers.onOpenPromiseModal?.();
          break;
        case "F10":
          e.preventDefault();
          handlers.onCompleteSale?.();
          break;
        case "F12":
          e.preventDefault();
          handlers.onOpenCalculator?.();
          break;
        case "Escape":
          handlers.onEscape?.();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}
