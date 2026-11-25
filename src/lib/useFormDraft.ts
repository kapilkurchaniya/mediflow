"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DRAFT_PREFIX = "mediflow:draft:";

export function buildDraftKey(formId: string, scope?: string): string {
  return scope ? `${DRAFT_PREFIX}${formId}:${scope}` : `${DRAFT_PREFIX}${formId}`;
}

export function readDraft<T>(storageKey: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeDraft<T>(storageKey: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function removeDraft(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Persists multi-row / complex form state in sessionStorage so accidental
 * navigation, page refreshes, or opening sub-flows never wipes entered data.
 */
export function useFormDraft<T>(
  storageKey: string,
  initialValue: T,
  options?: { isEmpty?: (val: T) => boolean }
) {
  const [value, setValueState] = useState<T>(initialValue);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const hydratedRef = useRef(false);
  const isEmptyRef = useRef(options?.isEmpty);

  useEffect(() => {
    isEmptyRef.current = options?.isEmpty;
  }, [options?.isEmpty]);

  // Hydrate once on mount (after SSR) when storageKey is available.
  useEffect(() => {
    const saved = readDraft<T>(storageKey);
    if (saved !== null && !(isEmptyRef.current?.(saved) ?? false)) {
      setValueState(saved);
      setHasRestoredDraft(true);
    }
    hydratedRef.current = true;
  }, [storageKey]);

  const setValue = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
        if (hydratedRef.current) {
          if (isEmptyRef.current?.(next)) {
            removeDraft(storageKey);
          } else {
            writeDraft(storageKey, next);
          }
        }
        return next;
      });
    },
    [storageKey]
  );

  const clearDraft = useCallback(
    (resetTo?: T) => {
      removeDraft(storageKey);
      setHasRestoredDraft(false);
      if (resetTo !== undefined) {
        setValueState(resetTo);
      }
    },
    [storageKey]
  );

  const dismissRestoredNotice = useCallback(() => {
    setHasRestoredDraft(false);
  }, []);

  return {
    value,
    setValue,
    hasRestoredDraft,
    clearDraft,
    dismissRestoredNotice,
  };
}
