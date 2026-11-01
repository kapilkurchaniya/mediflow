"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { PosCartLine } from "../_state/types";

export interface CartKeyContext {
  cart: PosCartLine[];
  index: number;
  isInput: boolean;
  inputType?: string | null;
  onRemoveLine: (batchId: string) => void;
  onUpdatePackQty: (batchId: string, packQty: number) => void;
  onUpdateLooseQty: (batchId: string, looseQty: number) => void;
  onFocusSearch?: () => void;
  focusRow: (index: number) => void;
  focusInput?: (type: "pack" | "loose") => void;
}

export function handleCartRowKey(
  e: { key: string; preventDefault: () => void },
  ctx: CartKeyContext
): boolean {
  const activeLine = ctx.cart[ctx.index];
  if (!activeLine) return false;

  if (!ctx.isInput) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (ctx.index < ctx.cart.length - 1) {
        ctx.focusRow(ctx.index + 1);
      }
      return true;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (ctx.index > 0) {
        ctx.focusRow(ctx.index - 1);
      } else if (ctx.onFocusSearch) {
        ctx.onFocusSearch();
      }
      return true;
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      ctx.onRemoveLine(activeLine.batchId);
      if (ctx.cart.length <= 1) {
        ctx.onFocusSearch?.();
      } else {
        const nextIdx = Math.min(ctx.index, ctx.cart.length - 2);
        ctx.focusRow(nextIdx);
      }
      return true;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      ctx.focusInput?.("pack");
      return true;
    }

    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      ctx.onUpdatePackQty(activeLine.batchId, (activeLine.packQty || 0) + 1);
      return true;
    }

    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      if (activeLine.packQty > 0) {
        ctx.onUpdatePackQty(activeLine.batchId, activeLine.packQty - 1);
      }
      return true;
    }
  } else {
    if (e.key === "Enter") {
      e.preventDefault();
      if (ctx.inputType === "pack") {
        ctx.focusInput?.("loose");
      } else {
        ctx.onFocusSearch?.();
      }
      return true;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      ctx.focusRow(ctx.index);
      return true;
    }

    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      if (ctx.inputType === "loose") {
        ctx.onUpdateLooseQty(activeLine.batchId, (activeLine.looseQty || 0) + 1);
      } else if (ctx.inputType === "pack") {
        ctx.onUpdatePackQty(activeLine.batchId, (activeLine.packQty || 0) + 1);
      }
      return true;
    }

    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      if (ctx.inputType === "loose" && activeLine.looseQty > 0) {
        ctx.onUpdateLooseQty(activeLine.batchId, activeLine.looseQty - 1);
      } else if (ctx.inputType === "pack" && activeLine.packQty > 0) {
        ctx.onUpdatePackQty(activeLine.batchId, activeLine.packQty - 1);
      }
      return true;
    }
  }

  return false;
}

interface UseCartKeyboardProps {
  cart: PosCartLine[];
  onRemoveLine: (batchId: string) => void;
  onUpdatePackQty: (batchId: string, packQty: number) => void;
  onUpdateLooseQty: (batchId: string, looseQty: number) => void;
  onFocusSearch?: () => void;
}

export function useCartKeyboard({
  cart,
  onRemoveLine,
  onUpdatePackQty,
  onUpdateLooseQty,
  onFocusSearch,
}: UseCartKeyboardProps) {
  const [rawSelectedIndex, setRawSelectedIndex] = useState<number>(0);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const selectedRowIndex =
    cart.length === 0
      ? -1
      : rawSelectedIndex >= cart.length
      ? cart.length - 1
      : rawSelectedIndex < 0
      ? 0
      : rawSelectedIndex;

  const focusRow = useCallback((index: number) => {
    if (index >= 0 && index < cart.length) {
      setRawSelectedIndex(index);
      const rowEl = rowRefs.current[index];
      if (rowEl) {
        rowEl.focus();
      }
    }
  }, [cart.length]);

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableRowElement>, index: number) => {
      const target = e.target as HTMLElement;
      const isInput = target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
      const inputType = isInput ? target.getAttribute("data-cart-input") : null;

      handleCartRowKey(e, {
        cart,
        index,
        isInput,
        inputType,
        onRemoveLine,
        onUpdatePackQty,
        onUpdateLooseQty,
        onFocusSearch,
        focusRow,
        focusInput: (type: "pack" | "loose") => {
          const input = rowRefs.current[index]?.querySelector<HTMLInputElement>(
            `input[data-cart-input="${type}"]`
          );
          if (input) {
            input.focus();
            input.select();
          } else if (type === "loose" && onFocusSearch) {
            onFocusSearch();
          }
        },
      });
    },
    [cart, focusRow, onFocusSearch, onRemoveLine, onUpdatePackQty, onUpdateLooseQty]
  );

  return {
    selectedRowIndex,
    setSelectedRowIndex: setRawSelectedIndex,
    rowRefs,
    focusRow,
    handleRowKeyDown,
  };
}
