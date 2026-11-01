"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Calculator as CalcIcon, X, Copy, Check } from "lucide-react";
import { evaluateMathExpression } from "@/lib/safe-calculator";

interface CounterCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyResult?: (val: number) => void;
}

export function CounterCalculator({ isOpen, onClose, onApplyResult }: CounterCalculatorProps) {
  const [expression, setExpression] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-evaluate expression live
  const evalResult = evaluateMathExpression(expression);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        setExpression("");
        setCopied(false);
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleAppend = useCallback((char: string) => {
    setExpression((prev) => prev + char);
    inputRef.current?.focus();
  }, []);

  const handleClear = useCallback(() => {
    setExpression("");
    inputRef.current?.focus();
  }, []);

  const handleBackspace = useCallback(() => {
    setExpression((prev) => prev.slice(0, -1));
    inputRef.current?.focus();
  }, []);

  const handleCopy = useCallback(async () => {
    if (!evalResult.success || evalResult.result === undefined) return;
    try {
      await navigator.clipboard.writeText(String(evalResult.result));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback
    }
  }, [evalResult]);

  const handleApply = useCallback(() => {
    if (!evalResult.success || evalResult.result === undefined) return;
    if (onApplyResult) {
      onApplyResult(evalResult.result);
      onClose();
    } else {
      void handleCopy();
    }
  }, [evalResult, onApplyResult, onClose, handleCopy]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (evalResult.success && evalResult.result !== undefined) {
        if (onApplyResult) {
          handleApply();
        } else {
          setExpression(String(evalResult.result));
        }
      }
    } else if (e.key === "c" || e.key === "C") {
      if (e.ctrlKey || e.metaKey) return; // Allow normal Ctrl+C copy
      e.preventDefault();
      handleClear();
    }
  };

  if (!isOpen) return null;

  const keypadRows = [
    ["C", "(", ")", "/"],
    ["7", "8", "9", "*"],
    ["4", "5", "6", "-"],
    ["1", "2", "3", "+"],
    ["0", ".", "%", "="],
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Counter Calculator"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-950/40 backdrop-blur-xs animate-fade"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl animate-enter select-none"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-150 px-4 py-3 bg-ink-50/70">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand-100 text-brand-700">
              <CalcIcon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink-900 leading-none">Counter Calculator</h3>
              <span className="text-[10px] text-ink-500 font-mono">F12 / Esc to exit</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Display */}
        <div className="bg-ink-900 p-4 text-right">
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent text-right font-mono text-xs text-ink-300 placeholder:text-ink-600 focus:outline-none"
            placeholder="Type expression (e.g. 120 * 3 - 10%)"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
          />
          <div className="mt-1 flex items-baseline justify-between overflow-hidden">
            <span className="text-[11px] text-ink-500 font-mono">
              {!evalResult.success && expression ? (
                <span className="text-rose-400 truncate">{evalResult.error}</span>
              ) : (
                <span>Result</span>
              )}
            </span>
            <span className="font-mono text-2xl font-bold tracking-tight text-white truncate max-w-[200px]">
              {evalResult.success && evalResult.formatted !== undefined ? evalResult.formatted : "0"}
            </span>
          </div>
        </div>

        {/* Keypad */}
        <div className="p-3 bg-white space-y-2">
          {keypadRows.map((row, rIdx) => (
            <div key={rIdx} className="grid grid-cols-4 gap-1.5">
              {row.map((btn) => {
                const isOp = ["+", "-", "*", "/", "%", "(", ")"].includes(btn);
                const isClear = btn === "C";
                const isEquals = btn === "=";

                return (
                  <button
                    key={btn}
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      if (isClear) handleClear();
                      else if (isEquals) {
                        if (evalResult.success && evalResult.result !== undefined) {
                          setExpression(String(evalResult.result));
                        }
                      } else {
                        handleAppend(btn);
                      }
                    }}
                    className={`h-10 rounded-lg text-sm font-semibold transition-all active:scale-95 ${
                      isEquals
                        ? "bg-brand-600 hover:bg-brand-700 text-white shadow-xs"
                        : isClear
                        ? "bg-rose-50 hover:bg-rose-100 text-rose-700"
                        : isOp
                        ? "bg-ink-100 hover:bg-ink-200 text-ink-800"
                        : "bg-ink-50 hover:bg-ink-100 text-ink-900 border border-ink-150"
                    }`}
                  >
                    {btn}
                  </button>
                );
              })}
            </div>
          ))}

          {/* Action Row */}
          <div className="pt-2 flex items-center gap-2 border-t border-ink-100">
            <button
              type="button"
              onClick={handleBackspace}
              tabIndex={-1}
              className="flex-1 py-1.5 px-3 rounded-lg border border-ink-200 text-xs font-medium text-ink-700 hover:bg-ink-50 active:scale-95"
            >
              Backspace
            </button>
            <button
              type="button"
              onClick={onApplyResult ? handleApply : handleCopy}
              disabled={!evalResult.success || !expression}
              tabIndex={-1}
              className="flex-1 py-1.5 px-3 rounded-lg bg-brand-50 hover:bg-brand-100 border border-brand-200 text-xs font-bold text-brand-700 flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? "Copied!" : onApplyResult ? "Use in Cart" : "Copy (Enter)"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
