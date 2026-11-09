import { pgTable, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Worker Heartbeats Table (Phase 6.1: Observability)
 * Records lifecycle state and execution health for background processes
 * (outbox worker, reminders cron, mobile webhook workers).
 */
export const workerHeartbeats = pgTable(
  "worker_heartbeats",
  {
    workerName: text("worker_name").primaryKey(),
    status: text("status", { enum: ["idle", "running", "ok", "failed"] }).notNull(),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    meta: jsonb("meta"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_worker_heartbeats_status").on(t.status, t.lastHeartbeatAt)],
);

export type WorkerHeartbeat = typeof workerHeartbeats.$inferSelect;
export type NewWorkerHeartbeat = typeof workerHeartbeats.$inferInsert;
