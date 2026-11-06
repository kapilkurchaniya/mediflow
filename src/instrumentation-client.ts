"use client";

/**
 * src/instrumentation-client.ts
 *
 * Client-side unhandled error telemetry listener.
 * Captures unhandled exceptions and promise rejections in browser contexts
 * without exposing patient data or credentials.
 */

let isInitialized = false;

export function initClientInstrumentation(): void {
  if (typeof window === "undefined" || isInitialized) return;
  isInitialized = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    try {
      const errorMsg = event.message || "Unknown client error";
      // Sanitize URL and message
      const sanitized = errorMsg.replace(/(?:key|token|auth)=[^&]+/gi, "key=[REDACTED]");
      if (process.env.NODE_ENV === "development") {
        console.warn("[Client Telemetry] Unhandled Error:", sanitized);
      }
    } catch {}
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    try {
      const reason = event.reason;
      const errorMsg = reason instanceof Error ? reason.message : String(reason);
      const sanitized = errorMsg.replace(/(?:key|token|auth)=[^&]+/gi, "key=[REDACTED]");
      if (process.env.NODE_ENV === "development") {
        console.warn("[Client Telemetry] Unhandled Rejection:", sanitized);
      }
    } catch {}
  });
}
