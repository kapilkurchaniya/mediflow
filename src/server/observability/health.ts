import "server-only";
import { sql } from "drizzle-orm";
import { db as defaultDb } from "@/server/db";
import { getAllWorkerHeartbeats } from "./heartbeat";
import { getPoolMetrics, type PoolMetrics } from "./pool";

export interface DatabaseProbeResult {
  status: "up" | "down";
  latencyMs: number;
}

export interface OutboxProbeResult {
  status: "healthy" | "degraded";
  pendingCount: number;
  eligiblePendingCount: number;
  oldestPendingAgeSeconds: number;
  lastProcessedAt?: string | null;
}

export interface MobileWebhooksProbeResult {
  status: "healthy" | "degraded";
  pendingCount: number;
  expiredLeasesCount: number;
  failedCount: number;
}

export interface WorkerProbeResult {
  status: "ok" | "running" | "stale" | "failed" | "idle";
  lastHeartbeatAt?: string | null;
  lastSuccessAt?: string | null;
  consecutiveFailures?: number;
}

export interface HealthDiagnostics {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptimeSeconds: number;
  database: DatabaseProbeResult;
  outbox: OutboxProbeResult;
  workers: Record<string, WorkerProbeResult>;
  mobileWebhooks: MobileWebhooksProbeResult;
  pool?: PoolMetrics;
}

export interface PublicHealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  uptimeSeconds: number;
}

/**
 * Checks PostgreSQL connectivity with driver-level execution timeout.
 */
export async function checkDatabase(db: typeof defaultDb): Promise<DatabaseProbeResult> {
  const startedAt = Date.now();
  try {
    await db.execute(sql`SELECT 1 AS ping`);
    return {
      status: "up",
      latencyMs: Date.now() - startedAt,
    };
  } catch {
    return {
      status: "down",
      latencyMs: Date.now() - startedAt,
    };
  }
}

/**
 * Queries outbox_events to evaluate total pending backlog vs eligible retry items.
 */
export async function checkOutbox(db: typeof defaultDb): Promise<OutboxProbeResult> {
  try {
    const res = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'pending') AS pending_count,
        count(*) FILTER (WHERE status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now())) AS eligible_pending_count,
        min(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_created_at,
        max(processed_at) FILTER (WHERE status = 'done') AS last_processed_at
      FROM outbox_events
    `);

    const row = res.rows[0] as Record<string, unknown> | undefined;
    const pendingCount = Number(row?.pending_count || 0);
    const eligiblePendingCount = Number(row?.eligible_pending_count || 0);
    const oldestPendingCreatedAt = row?.oldest_pending_created_at
      ? new Date(row.oldest_pending_created_at as string)
      : null;
    const lastProcessedAt = row?.last_processed_at
      ? new Date(row.last_processed_at as string).toISOString()
      : null;

    const oldestPendingAgeSeconds = oldestPendingCreatedAt
      ? Math.max(0, Math.floor((Date.now() - oldestPendingCreatedAt.getTime()) / 1000))
      : 0;

    // Degraded threshold: > 500 total pending or oldest item > 900 seconds (15 min)
    const isDegraded = pendingCount > 500 || oldestPendingAgeSeconds > 900;

    return {
      status: isDegraded ? "degraded" : "healthy",
      pendingCount,
      eligiblePendingCount,
      oldestPendingAgeSeconds,
      lastProcessedAt,
    };
  } catch {
    return {
      status: "degraded",
      pendingCount: 0,
      eligiblePendingCount: 0,
      oldestPendingAgeSeconds: 0,
    };
  }
}

/**
 * Evaluates background worker heartbeats against cadence thresholds.
 */
export async function checkWorkerHeartbeats(
  db: typeof defaultDb,
): Promise<Record<string, WorkerProbeResult>> {
  const result: Record<string, WorkerProbeResult> = {};

  try {
    const heartbeats = await getAllWorkerHeartbeats(db);
    const now = Date.now();

    for (const hb of heartbeats) {
      const lastHeartbeatMs = hb.lastHeartbeatAt ? new Date(hb.lastHeartbeatAt).getTime() : 0;
      const ageSeconds = lastHeartbeatMs > 0 ? Math.floor((now - lastHeartbeatMs) / 1000) : 999999;

      let workerStatus: WorkerProbeResult["status"] = hb.status as WorkerProbeResult["status"];

      // Stale checks based on worker type (outbox worker expected <= 60s, stale > 120s)
      if (hb.workerName === "outbox_worker" && ageSeconds > 120) {
        workerStatus = "stale";
      } else if (hb.workerName === "reminders_cron" && ageSeconds > 93600) {
        // Stale if > 26 hours
        workerStatus = "stale";
      }

      result[hb.workerName] = {
        status: workerStatus,
        lastHeartbeatAt: hb.lastHeartbeatAt ? new Date(hb.lastHeartbeatAt).toISOString() : null,
        lastSuccessAt: hb.lastSuccessAt ? new Date(hb.lastSuccessAt).toISOString() : null,
        consecutiveFailures: hb.consecutiveFailures,
      };
    }
  } catch {}

  return result;
}

/**
 * Checks event-driven mobile payment webhooks for excessive queue backlog or expired leases.
 */
export async function checkMobileWebhooks(
  db: typeof defaultDb,
): Promise<MobileWebhooksProbeResult> {
  try {
    const res = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'pending') AS pending_count,
        count(*) FILTER (WHERE status = 'processing' AND lease_expires_at < now()) AS expired_leases_count,
        count(*) FILTER (WHERE status = 'failed') AS failed_count
      FROM delivery_payment_webhooks
    `);
    const row = res.rows[0] as Record<string, unknown> | undefined;
    const pendingCount = Number(row?.pending_count || 0);
    const expiredLeasesCount = Number(row?.expired_leases_count || 0);
    const failedCount = Number(row?.failed_count || 0);
    const isDegraded = expiredLeasesCount > 10 || failedCount > 50;

    return {
      status: isDegraded ? "degraded" : "healthy",
      pendingCount,
      expiredLeasesCount,
      failedCount,
    };
  } catch {
    return {
      status: "healthy",
      pendingCount: 0,
      expiredLeasesCount: 0,
      failedCount: 0,
    };
  }
}

/**
 * Aggregates all probes into complete operational diagnostics.
 */
export async function runHealthDiagnostics(
  db: typeof defaultDb = defaultDb,
): Promise<HealthDiagnostics> {
  const [database, outbox, workers, mobileWebhooks] = await Promise.all([
    checkDatabase(db),
    checkOutbox(db),
    checkWorkerHeartbeats(db),
    checkMobileWebhooks(db),
  ]);

  let overallStatus: HealthDiagnostics["status"] = "healthy";

  if (database.status === "down") {
    overallStatus = "unhealthy";
  } else if (
    outbox.status === "degraded" ||
    mobileWebhooks.status === "degraded" ||
    Object.values(workers).some((w) => w.status === "stale" || w.status === "failed")
  ) {
    overallStatus = "degraded";
  }

  return {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database,
    outbox,
    workers,
    mobileWebhooks,
    pool: getPoolMetrics(),
  };
}
