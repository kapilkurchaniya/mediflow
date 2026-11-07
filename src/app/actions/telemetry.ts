"use server";

import { captureException } from "@/server/observability/error-reporter";

export interface ClientBoundaryErrorPayload {
  module: string;
  digest?: string;
  message?: string;
}

/**
 * Server action to record client error boundary exceptions into the
 * centralized server-side observability pipeline (Pino / Sentry adapter)
 * with strict PII & compliance data scrub applied.
 */
export async function logClientBoundaryError(payload: ClientBoundaryErrorPayload): Promise<void> {
  try {
    const safeModule = (payload.module || "unknown").slice(0, 50);
    const safeDigest = payload.digest ? payload.digest.slice(0, 32) : "no-digest";
    const safeMsg = (payload.message || "Client boundary caught error").slice(0, 150);

    const syntheticError = new Error(`[Boundary:${safeModule}] ${safeMsg} (#${safeDigest})`);

    captureException(syntheticError, {
      route: `/dashboard/${safeModule}`,
      action: "client_error_boundary",
      metadata: {
        workerName: safeModule,
        status: safeDigest,
      },
    });
  } catch {
    // Failsafe: logging errors must never disrupt caller
  }
}
