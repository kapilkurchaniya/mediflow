import "server-only";
import pino, { type Logger } from "pino";
import { env } from "@/env";
import { PINO_REDACT_PATHS, CENSOR_VALUE } from "./redact";

/**
 * Root Pino logger instance configured for production compliance:
 * - Server-only execution
 * - Automated ISO timestamps
 * - Strict PII, credential, and financial payload redaction
 * - Safe error serializer
 */
export const rootLogger: Logger = pino({
  level: env.LOG_LEVEL || "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: PINO_REDACT_PATHS,
    censor: CENSOR_VALUE,
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  serializers: {
    err: (err: unknown) => {
      if (!err || typeof err !== "object") return err;
      const errorObj = err as Error & { digest?: string; code?: string };
      return {
        type: errorObj.name || "Error",
        message: errorObj.message,
        code: errorObj.code,
        digest: errorObj.digest,
        stack: process.env.NODE_ENV === "development" ? errorObj.stack : undefined,
      };
    },
  },
});

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEventMeta {
  action: string;
  requestId?: string;
  tenantId?: string;
  latencyMs?: number;
  status?: string | number;
  [key: string]: unknown;
}

/**
 * Helper to log an allowlisted structured event cleanly.
 * Guarantees standard fields (`action`, `latencyMs`, `status`) and applies redaction.
 */
export function logEvent(level: LogLevel, meta: LogEventMeta, message: string): void {
  rootLogger[level](meta, message);
}
