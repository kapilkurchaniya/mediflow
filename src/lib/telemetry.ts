"use client";

import { logClientBoundaryError, type ClientBoundaryErrorPayload } from "@/app/actions/telemetry";

export const ALLOWED_MODULES = [
  "dashboard-root",
  "pos",
  "sales",
  "inventory",
  "purchases",
  "accounting",
  "compliance",
  "reports",
  "settings",
] as const;

export type AllowedBoundaryModule = (typeof ALLOWED_MODULES)[number];

export const ALLOWED_EVENT_CODES = [
  "REACT_BOUNDARY_FAILURE",
  "MODULE_INITIALIZATION_ERROR",
] as const;

export type AllowedEventCode = (typeof ALLOWED_EVENT_CODES)[number];

/**
 * Dispatches error boundary telemetry to both optional browser Sentry SDK
 * and the server-side ErrorReporter infrastructure.
 *
 * Guarantees:
 * 1. Safe diagnostics ONLY: Absolutely NO error.message, error stack, credentials,
 *    patient, or prescription data is transmitted.
 * 2. Send only allowlisted module names, safe digests, and fixed event codes.
 * 3. Fail-safe: Reporting failures NEVER throw or disrupt client recovery UI.
 */
export function reportBoundaryError(
  moduleName: AllowedBoundaryModule,
  error: { digest?: string } | null | undefined,
  eventCode: AllowedEventCode = "REACT_BOUNDARY_FAILURE"
): void {
  try {
    const rawDigest = error?.digest;
    const safeDigest = typeof rawDigest === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(rawDigest)
      ? rawDigest
      : undefined;

    // 1. Browser Sentry SDK: Record only sanitized tags, NEVER raw exception object
    if (typeof window !== "undefined") {
      const win = window as unknown as {
        Sentry?: {
          captureMessage?: (msg: string, ctx?: unknown) => void;
        };
      };
      if (typeof win.Sentry?.captureMessage === "function") {
        win.Sentry.captureMessage(`[Boundary:${moduleName}] ${eventCode}`, {
          level: "error",
          tags: {
            module: moduleName,
            eventCode,
            digest: safeDigest || "none",
          },
        });
      }
    }

    // 2. Server action: Fire-and-forget constrained payload (zero error.message)
    const payload: ClientBoundaryErrorPayload = {
      module: moduleName,
      digest: safeDigest,
      code: eventCode,
    };

    void logClientBoundaryError(payload).catch(() => {
      // Intentionally swallowed to protect recovery UI
    });
  } catch {
    // Failsafe: logging failure must NEVER disrupt recovery UI
  }
}
