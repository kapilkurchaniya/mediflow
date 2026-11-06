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

export interface SafeLogMeta {
  action: string;
  requestId?: string;
  tenantId?: string;
  latencyMs?: number;
  status?: string | number;
  workerName?: string;
  batchSize?: number;
  processed?: number;
  succeeded?: number;
  failed?: number;
  route?: string;
  method?: string;
  nodeVersion?: string;
  env?: string;
  runtime?: string;
}

/**
 * Strictly allowlisted structured logging helpers preventing arbitrary object dumps.
 */
export function logInfo(meta: SafeLogMeta, message: string): void {
  rootLogger.info(meta, message);
}

export function logWarn(meta: SafeLogMeta, message: string): void {
  rootLogger.warn(meta, message);
}

export function logError(meta: SafeLogMeta, message: string, err?: unknown): void {
  rootLogger.error({ ...meta, err }, message);
}

export function logEvent(level: LogLevel, meta: SafeLogMeta, message: string): void {
  rootLogger[level](meta, message);
}
