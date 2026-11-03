import { useState, useEffect } from "react";
import { liveQuery } from "dexie";

/**
 * Lightweight React hook wrapping Dexie's native liveQuery.
 * Automatically observes Dexie table mutations across tabs and components without polling.
 */
export function useLiveQuery<T>(
  querier: () => Promise<T> | T,
  deps: unknown[] = [],
  defaultValue: T,
): T {
  const [value, setValue] = useState<T>(defaultValue);

  useEffect(() => {
    let isMounted = true;
    try {
      const observable = liveQuery(querier);
      const subscription = observable.subscribe({
        next: (val) => {
          if (isMounted) {
            setValue(val);
          }
        },
        error: (err) => {
          console.error("[useLiveQuery] Dexie observation error:", err);
        },
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    } catch (e) {
      console.error("[useLiveQuery] Failed to create live query observable:", e);
      return () => {
        isMounted = false;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
