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
  onFocusCustomer?: () => void;
  onUndoCart?: () => void;
  onToggleBillProfit?: () => void;
  profile?: "mediflow" | "marg";
  isModalOpen?: boolean;
  allowCompleteSaleInModal?: boolean;
}

export function usePosShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        activeEl?.tagName === "SELECT";
      const isModalActive = Boolean(handlers.isModalOpen);

      // Ctrl/Cmd + Enter or Ctrl+W (Marg Classic) -> Complete Sale
      if (((e.ctrlKey || e.metaKey) && e.key === "Enter") || (handlers.profile === "marg" && e.ctrlKey && e.key.toLowerCase() === "w")) {
        e.preventDefault();
        handlers.onCompleteSale?.();
        return;
      }

      // Ctrl + Z / Alt + Backspace -> Undo last cart line/qty action (U7)
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !isInput) || (e.altKey && e.key === "Backspace")) {
        e.preventDefault();
        handlers.onUndoCart?.();
        return;
      }

      // Alt + F10 -> Toggle bill profit preview (when allowed)
      if (e.altKey && e.key === "F10") {
        e.preventDefault();
        handlers.onToggleBillProfit?.();
        return;
      }

      // Ctrl + F1 -> Shortcut Cheat Sheet
      if (e.ctrlKey && (e.key === "F1" || e.key === "f1")) {
        e.preventDefault();
        handlers.onOpenShortcutsCheatSheet?.();
        return;
      }

      // If a modal is open, only allow Escape, F12 (calculator), or F10 (when payment settlement modal is open)
      if (isModalActive) {
        if (e.key === "Escape") {
          handlers.onEscape?.();
        } else if (e.key === "F10" && handlers.allowCompleteSaleInModal) {
          e.preventDefault();
          handlers.onCompleteSale?.();
        } else if (e.key === "F12") {
          e.preventDefault();
          handlers.onOpenCalculator?.();
        }
        return;
      }

      // Function keys F2-F12, Insert, End, and / are reserved for Marg counter operations
      switch (e.key) {
        case "Insert":
          if (!isInput) {
            e.preventDefault();
            handlers.onFocusSearch?.();
          }
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
        case "F5":
          e.preventDefault();
          handlers.onFocusCustomer?.();
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
