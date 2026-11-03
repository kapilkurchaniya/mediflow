"use client";

import { useEffect, useState } from "react";

export interface RegisterSWProps {
  /** If provided, overrides NODE_ENV check for testing/staging */
  forceEnable?: boolean;
}

/**
 * Service Worker Registration & Update Coordination Component.
 *
 * Directives:
 * 1. Skips registration in local development by default to keep Turbopack HMR fast.
 * 2. In production, registers /sw.js with root scope '/'.
 * 3. Does NOT force uncoordinated reloads while checkouts may be active; displays an update banner.
 */
export function RegisterSW({ forceEnable }: RegisterSWProps) {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // 1. Guard against non-browser environments or unsupported browsers
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // 2. Only register in production or when explicitly enabled
    const isProd = process.env.NODE_ENV === "production";
    const isExplicitlyEnabled = process.env.NEXT_PUBLIC_ENABLE_SW === "true" || forceEnable;

    if (!isProd && !isExplicitlyEnabled) {
      return;
    }

    let isSubscribed = true;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        if (!isSubscribed) return;

        // Check if a worker is already waiting in background
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
        }

        // Listen for new updates discovered in background
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              if (isSubscribed) {
                setWaitingWorker(installingWorker);
              }
            }
          });
        });
      })
      .catch((err) => {
        console.warn("[PWA] Service Worker registration failed:", err);
      });

    return () => {
      isSubscribed = false;
    };
  }, [forceEnable]);

  const handleApplyUpdate = () => {
    if (!waitingWorker) return;

    // Send activation command to waiting service worker
    waitingWorker.postMessage({ type: "SKIP_WAITING" });

    // Reload once the new controller takes over
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    }, { once: true });
  };

  if (!waitingWorker) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-slate-900 p-4 text-sm text-slate-100 shadow-xl"
    >
      <div className="flex flex-col">
        <span className="font-semibold text-emerald-400">Update Available</span>
        <span className="text-xs text-slate-300">
          A new version of MediFlow POS is ready.
        </span>
      </div>
      <button
        type="button"
        onClick={handleApplyUpdate}
        className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
      >
        Update Now
      </button>
    </div>
  );
}
