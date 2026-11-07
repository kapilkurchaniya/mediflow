"use server";

import { captureException } from "@/server/observability/error-reporter";
import {
  ALLOWED_MODULES,
  ALLOWED_EVENT_CODES,
  type AllowedBoundaryModule,
  type AllowedEventCode,
} from "@/lib/telemetry";

export interface ClientBoundaryErrorPayload {
  module: AllowedBoundaryModule;
  digest?: string;
  code?: AllowedEventCode;
}

const DIGEST_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Server action to record client error boundary exceptions into the
 * centralized server-side observability pipeline.
 *
 * Security:
 * - Constrained allowlist validation (module, diagnostic code).
 * - ZERO transmission of raw error.message, stack traces, patient data, or SQL.
 * - Strict length and format validation on digest.
 * - Fail-safe execution: rejects invalid inputs safely without throwing.
 */
export async function logClientBoundaryError(payload: ClientBoundaryErrorPayload): Promise<{ recorded: boolean }> {
  try {
    if (!payload || typeof payload !== "object") {
      return { recorded: false };
    }

    const { module, digest, code = "REACT_BOUNDARY_FAILURE" } = payload;

    // 1. Validate allowlisted module
    if (!ALLOWED_MODULES.includes(module)) {
      return { recorded: false };
    }

    // 2. Validate allowlisted event code
    if (!ALLOWED_EVENT_CODES.includes(code)) {
      return { recorded: false };
    }

    // 3. Validate digest if provided
    const safeDigest = digest && typeof digest === "string" && DIGEST_REGEX.test(digest)
      ? digest
      : undefined;

    // Create synthetic, strictly sanitized event for observability
    const syntheticError = new Error(`[Boundary:${module}] ${code}${safeDigest ? ` (#${safeDigest})` : ""}`);

    captureException(syntheticError, {
      route: `/dashboard/${module}`,
      action: "client_error_boundary",
      metadata: {
        workerName: module,
        status: code,
      },
    });

    return { recorded: true };
  } catch {
    // Failsafe: logging errors must never disrupt client recovery
    return { recorded: false };
  }
}
