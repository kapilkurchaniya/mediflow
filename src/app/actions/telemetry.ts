"use server";

import { headers } from "next/headers";
import { getCurrentSession } from "@/server/auth";
import { captureException } from "@/server/observability/error-reporter";
import {
  ALLOWED_MODULES,
  ALLOWED_EVENT_CODES,
  DIGEST_REGEX,
  type ClientBoundaryErrorPayload,
} from "@/lib/telemetry-contract";

export type { ClientBoundaryErrorPayload };

interface RateBucket {
  count: number;
  resetAt: number;
}
const telemetryRateLimits = new Map<string, RateBucket>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_EVENTS_PER_WINDOW = 30; // Max 30 boundary events per minute per session/ip

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = telemetryRateLimits.get(key);
  if (!bucket || now > bucket.resetAt) {
    telemetryRateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (bucket.count >= MAX_EVENTS_PER_WINDOW) {
    return false; // Rate limit exceeded
  }
  bucket.count++;
  return true;
}

/**
 * Server action to record client error boundary exceptions into the
 * centralized server-side observability pipeline.
 *
 * Security:
 * - Constrained allowlist validation (module, diagnostic code).
 * - ZERO transmission of raw error.message, stack traces, patient data, or SQL.
 * - Strict length and format validation on digest.
 * - Sliding window rate limiting per session / IP to prevent ingestion abuse.
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

    // 3. Rate limiting and session attribution
    let tenantId: string | undefined;
    let rateKey = "anon";
    try {
      const { session, user } = await getCurrentSession();
      if (session) {
        tenantId = session.tenantId ?? undefined;
        rateKey = `user:${user?.id || session.id}`;
      } else {
        const h = await headers();
        const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
        rateKey = `ip:${ip}`;
      }
    } catch {
      // In standalone tests or when headers unavailable
      rateKey = "fallback";
    }

    if (!checkRateLimit(rateKey)) {
      return { recorded: false };
    }

    // 4. Validate digest if provided
    const safeDigest = digest && typeof digest === "string" && DIGEST_REGEX.test(digest)
      ? digest
      : undefined;

    // Create synthetic, strictly sanitized event for observability
    const syntheticError = new Error(`[Boundary:${module}] ${code}${safeDigest ? ` (#${safeDigest})` : ""}`);

    captureException(syntheticError, {
      route: `/dashboard/${module}`,
      tenantId,
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
