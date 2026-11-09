import "server-only";
import { sql } from "drizzle-orm";
import { db as defaultDb } from "@/server/db";
import { workerHeartbeats, type WorkerHeartbeat } from "@/server/db/schema/observability";

export type WorkerStatus = "idle" | "running" | "ok" | "failed";

export interface SafeWorkerMeta {
  processed?: number;
  succeeded?: number;
  failed?: number;
  batchSize?: number;
  durationMs?: number;
  [key: string]: unknown;
}

/**
 * Filters metadata to allow only safe, non-PII operational metrics.
 */
function sanitizeMeta(meta?: SafeWorkerMeta): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object") return null;
  const allowedKeys = ["processed", "succeeded", "failed", "batchSize", "durationMs", "enqueued"];
  const safe: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (meta[key] !== undefined) {
      safe[key] = meta[key];
    }
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

/**
 * Records that a background worker has started execution.
 */
export async function recordWorkerStart(
  db: typeof defaultDb,
  workerName: string,
  meta?: SafeWorkerMeta,
): Promise<void> {
  const safeMeta = sanitizeMeta(meta);
  await db.execute(sql`
    INSERT INTO worker_heartbeats (
      worker_name, status, last_started_at, last_heartbeat_at, consecutive_failures, meta, updated_at
    )
    VALUES (
      ${workerName}, 'running', now(), now(), 0, ${safeMeta ? JSON.stringify(safeMeta) : null}::jsonb, now()
    )
    ON CONFLICT (worker_name) DO UPDATE
    SET status = 'running',
        last_started_at = now(),
        last_heartbeat_at = now(),
        meta = COALESCE(${safeMeta ? JSON.stringify(safeMeta) : null}::jsonb, worker_heartbeats.meta),
        updated_at = now()
  `);
}

/**
 * Records that a background worker successfully completed execution.
 */
export async function recordWorkerSuccess(
  db: typeof defaultDb,
  workerName: string,
  meta?: SafeWorkerMeta,
): Promise<void> {
  const safeMeta = sanitizeMeta(meta);
  await db.execute(sql`
    INSERT INTO worker_heartbeats (
      worker_name, status, last_heartbeat_at, last_success_at, consecutive_failures, meta, updated_at
    )
    VALUES (
      ${workerName}, 'ok', now(), now(), 0, ${safeMeta ? JSON.stringify(safeMeta) : null}::jsonb, now()
    )
    ON CONFLICT (worker_name) DO UPDATE
    SET status = 'ok',
        last_heartbeat_at = now(),
        last_success_at = now(),
        consecutive_failures = 0,
        meta = COALESCE(${safeMeta ? JSON.stringify(safeMeta) : null}::jsonb, worker_heartbeats.meta),
        updated_at = now()
  `);
}

/**
 * Records that a background worker encountered an execution failure.
 */
export async function recordWorkerFailure(
  db: typeof defaultDb,
  workerName: string,
  meta?: SafeWorkerMeta,
): Promise<void> {
  const safeMeta = sanitizeMeta(meta);
  await db.execute(sql`
    INSERT INTO worker_heartbeats (
      worker_name, status, last_heartbeat_at, last_error_at, consecutive_failures, meta, updated_at
    )
    VALUES (
      ${workerName}, 'failed', now(), now(), 1, ${safeMeta ? JSON.stringify(safeMeta) : null}::jsonb, now()
    )
    ON CONFLICT (worker_name) DO UPDATE
    SET status = 'failed',
        last_heartbeat_at = now(),
        last_error_at = now(),
        consecutive_failures = worker_heartbeats.consecutive_failures + 1,
        meta = COALESCE(${safeMeta ? JSON.stringify(safeMeta) : null}::jsonb, worker_heartbeats.meta),
        updated_at = now()
  `);
}

/**
 * Retrieves all registered worker heartbeats.
 */
export async function getAllWorkerHeartbeats(
  db: typeof defaultDb,
): Promise<WorkerHeartbeat[]> {
  const result = await db.select().from(workerHeartbeats);
  return result;
}
