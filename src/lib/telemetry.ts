"use client";

import { logClientBoundaryError } from "@/app/actions/telemetry";

/**
 * Dispatches error boundary telemetry to both optional browser Sentry SDK
 * and the server-side ErrorReporter infrastructure.
 *
 * Guarantees:
 * 1. Safe diagnostics only (no credentials, patient, or prescription PII).
 * 2. Fail-safe: Reporting failures NEVER throw or disrupt client recovery UI.
 */
export function reportBoundaryError(moduleName: string, error: Error & { digest?: string }): void {
  try {
    // 1. Browser Sentry SDK integration if active
    if (typeof window !== "undefined") {
      const win = window as unknown as {
        Sentry?: { captureException: (err: unknown, ctx?: unknown) => void };
      };
      if (typeof win.Sentry?.captureException === "function") {
        win.Sentry.captureException(error, {
          tags: { module: moduleName, digest: error.digest },
        });
      }
    }

    // 2. Server-side ErrorReporter integration via safe server action (fire-and-forget)
    void logClientBoundaryError({
      module: moduleName,
      digest: error.digest,
      message: error.message ? error.message.slice(0, 150) : undefined,
    }).catch(() => {
      // Intentionally swallowed to protect recovery UI
    });
  } catch {
    // Failsafe: logging failure must NEVER disrupt recovery UI
  }
}
