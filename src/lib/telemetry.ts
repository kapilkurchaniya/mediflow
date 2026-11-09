"use client";

import { logClientBoundaryError } from "@/app/actions/telemetry";
import {
  type AllowedBoundaryModule,
  type AllowedEventCode,
  type ClientBoundaryErrorPayload,
  DIGEST_REGEX,
} from "@/lib/telemetry-contract";

export {
  ALLOWED_MODULES,
  ALLOWED_EVENT_CODES,
  type AllowedBoundaryModule,
  type AllowedEventCode,
  type ClientBoundaryErrorPayload,
} from "@/lib/telemetry-contract";

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
    const safeDigest = typeof rawDigest === "string" && DIGEST_REGEX.test(rawDigest)
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
