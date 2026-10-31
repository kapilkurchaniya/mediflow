"use client";

import { useEffect, useRef } from "react";

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
  onEscape?: () => void;
}

export function usePosShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Function keys F2-F10 and / are reserved for counter operations
      switch (e.key) {
        case "F2":
          e.preventDefault();
          if (handlersRef.current.onResetSale) {
            handlersRef.current.onResetSale();
          } else {
            handlersRef.current.onFocusSearch?.();
          }
          break;
        case "F3":
          e.preventDefault();
          handlersRef.current.onFocusSearch?.();
          break;
        case "/":
          if (
            document.activeElement?.tagName !== "INPUT" &&
            document.activeElement?.tagName !== "TEXTAREA"
          ) {
            e.preventDefault();
            handlersRef.current.onFocusSearch?.();
          }
          break;
        case "F4":
          e.preventDefault();
          handlersRef.current.onOpenRegister?.();
          break;
        case "F6":
          e.preventDefault();
          handlersRef.current.onHoldBill?.();
          break;
        case "F7":
          e.preventDefault();
          handlersRef.current.onListHeldBills?.();
          break;
        case "F8":
          e.preventDefault();
          handlersRef.current.onOpenPaymentModal?.();
          break;
        case "F9":
          e.preventDefault();
          handlersRef.current.onOpenPromiseModal?.();
          break;
        case "F10":
          e.preventDefault();
          handlersRef.current.onCompleteSale?.();
          break;
        case "Escape":
          handlersRef.current.onEscape?.();
          break;
        default:
          break;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
