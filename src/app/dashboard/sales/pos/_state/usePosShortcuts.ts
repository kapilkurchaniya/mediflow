"use client";

import { useEffect } from "react";

export interface ShortcutHandlers {
  onFocusSearch?: () => void;
  onOpenSubstitutes?: () => void;
  onOpenRegister?: () => void;
  onHoldBill?: () => void;
  onListHeldBills?: () => void;
  onOpenPaymentModal?: () => void;
  onOpenPromiseModal?: () => void;
  onCompleteSale?: () => void;
  onEscape?: () => void;
}

export function usePosShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Function keys F2-F10 are reserved for counter operations
      switch (e.key) {
        case "F2":
          e.preventDefault();
          handlers.onFocusSearch?.();
          break;
        case "F3":
          e.preventDefault();
          handlers.onOpenSubstitutes?.();
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
