import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Logger } from "pino";
import { rootLogger } from "./logger";

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  action?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Validates or generates a UUID request identifier from an incoming header.
 */
export function createRequestId(existingHeader?: string | null): string {
  if (existingHeader && typeof existingHeader === "string") {
    const trimmed = existingHeader.trim();
    // Allow alphanumeric characters, hyphens, and underscores up to 64 chars
    if (/^[a-zA-Z0-9_-]{8,64}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return crypto.randomUUID();
}

/**
 * Executes a function within an isolated AsyncLocalStorage request context.
 */
export async function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => Promise<T> | T,
): Promise<T> {
  return asyncLocalStorage.run(context, fn);
}

/**
 * Retrieves the current ambient request context, if any.
 */
export function getRequestContext(): RequestContext | undefined {
  return asyncLocalStorage.getStore();
}

/**
 * Returns a child logger pre-bound to current ambient requestId and tenantId.
 * If called outside of an active request, returns the rootLogger.
 */
export function getLogger(): Logger {
  const store = asyncLocalStorage.getStore();
  if (!store) {
    return rootLogger;
  }

  const bindings: Record<string, unknown> = {
    requestId: store.requestId,
  };
  if (store.tenantId) {
    bindings.tenantId = store.tenantId;
  }
  if (store.action) {
    bindings.action = store.action;
  }

  return rootLogger.child(bindings);
}

/**
 * Establishes an independent context for background workers and crons
 * to prevent inheriting stale or untrusted request context.
 */
export async function runWithJobContext<T>(
  jobName: string,
  fn: () => Promise<T> | T,
): Promise<T> {
  const jobContext: RequestContext = {
    requestId: `job_${jobName}_${crypto.randomUUID().slice(0, 8)}`,
    action: jobName,
  };
  return asyncLocalStorage.run(jobContext, fn);
}
