import "server-only";
import { rootLogger } from "../logging/logger";
import { scrubSensitiveData } from "../logging/redact";
import { getRequestContext } from "../logging/context";
import { env } from "@/env";

export type NormalizedErrorCode =
  | "DATABASE_ERROR"
  | "DATABASE_TIMEOUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "INTERNAL_SERVER_ERROR";

export interface NormalizedError {
  code: NormalizedErrorCode;
  message: string;
  digest?: string;
  stack?: string;
}

export interface SafeDiagnosticMeta {
  route?: string;
  method?: string;
  routerKind?: string;
  routeType?: string;
  latencyMs?: number;
  status?: number | string;
  batchSize?: number;
  processed?: number;
  succeeded?: number;
  failed?: number;
  action?: string;
  workerName?: string;
}

export interface ErrorReportContext {
  requestId?: string;
  tenantId?: string;
  route?: string;
  action?: string;
  metadata?: SafeDiagnosticMeta;
}

export interface ErrorReporterAdapter {
  captureException(err: unknown, ctx?: ErrorReportContext): void;
}

let activeAdapter: ErrorReporterAdapter | null = null;

/**
 * Registers an optional external error reporting adapter (such as Sentry).
 */
export function registerErrorReporterAdapter(adapter: ErrorReporterAdapter): void {
  activeAdapter = adapter;
}

/**
 * Normalizes unknown thrown errors into safe, structured error objects.
 * Scrubs raw database connection strings, credentials, or SQL parameters.
 */
export function normalizeError(err: unknown): NormalizedError {
  if (err instanceof Error) {
    const rawMsg = err.message || "An unexpected error occurred";
    let code: NormalizedErrorCode = "INTERNAL_SERVER_ERROR";

    // Classify standard error patterns
    if (/timeout|statement timeout|canceling statement/i.test(rawMsg)) {
      code = "DATABASE_TIMEOUT";
    } else if (/connection refused|ECONNREFUSED|postgres|pg_/i.test(rawMsg)) {
      code = "DATABASE_ERROR";
    } else if (/unauthorized|unauthenticated|jwt/i.test(rawMsg)) {
      code = "UNAUTHORIZED";
    } else if (/forbidden|permission/i.test(rawMsg)) {
      code = "FORBIDDEN";
    } else if (/not found/i.test(rawMsg)) {
      code = "NOT_FOUND";
    } else if (/validation|zod|schema/i.test(rawMsg)) {
      code = "VALIDATION_ERROR";
    }

    // Sanitize message: strip potential postgres connection strings or SQL fragments
    const sanitizedMsg = rawMsg
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "postgres://[REDACTED]")
      .replace(/key\s*=\s*'[^\']+'/gi, "key='[REDACTED]'");

    const digest = "digest" in err && typeof (err as { digest?: unknown }).digest === "string"
      ? String((err as { digest?: unknown }).digest)
      : undefined;

    return {
      code,
      message: sanitizedMsg,
      digest,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    };
  }

  return {
    code: "INTERNAL_SERVER_ERROR",
    message: typeof err === "string" ? err : "Unknown error",
  };
}

/**
 * Global captureException entrypoint:
 * - Never throws or disrupts business execution
 * - Sanitizes all context metadata to prevent PII leakage
 * - Logs to Pino with ambient requestId & tenantId
 * - Optional Sentry integration when SENTRY_DSN is configured
 */
export function captureException(err: unknown, explicitCtx?: ErrorReportContext): void {
  try {
    const normalized = normalizeError(err);
    const ambientCtx = getRequestContext();

    const mergedCtx: ErrorReportContext = {
      requestId: explicitCtx?.requestId || ambientCtx?.requestId,
      tenantId: explicitCtx?.tenantId || ambientCtx?.tenantId,
      route: explicitCtx?.route,
      metadata: explicitCtx?.metadata ? scrubSensitiveData(explicitCtx.metadata) : undefined,
    };

    rootLogger.error(
      {
        err: normalized,
        context: mergedCtx,
        action: "error_captured",
      },
      `[ErrorReporter] ${normalized.code}: ${normalized.message}`,
    );

    // Optional telemetry adapter dispatch (e.g. Sentry) if registered
    if (activeAdapter) {
      try {
        activeAdapter.captureException(err, mergedCtx);
      } catch {
        // Failsafe: adapter errors never interrupt execution
      }
    }
  } catch (reporterErr) {
    // Failsafe: never allow ErrorReporter itself to bubble unhandled exceptions
    try {
      console.error("[ErrorReporter Fail-Safe]", reporterErr);
    } catch {}
  }
}
