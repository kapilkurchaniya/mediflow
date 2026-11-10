import { pgTable, text, timestamp, integer, jsonb, index, uuid } from "drizzle-orm/pg-core";

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

/**
 * Pilot Feedback Table (Phase 6.6: Pilot Operations & Hardening)
 * Captures direct counter bug reports, latency issues, and feedback from pilot pharmacy staff.
 */
export const pilotFeedback = pgTable(
  "pilot_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: text("tenant_id").notNull(),
    storeId: text("store_id").notNull(),
    userId: text("user_id").notNull(),
    category: text("category", {
      enum: ["speed", "scanner", "gst_math", "thermal_print", "offline_sync", "ui_ux", "other"],
    }).notNull(),
    severity: text("severity", { enum: ["low", "medium", "high", "blocker"] }).notNull().default("medium"),
    summary: text("summary").notNull(),
    details: text("details").notNull(),
    diagnostics: jsonb("diagnostics"),
    status: text("status", { enum: ["open", "triaged", "resolved"] }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_pilot_feedback_store").on(t.storeId, t.createdAt)],
);

export type PilotFeedback = typeof pilotFeedback.$inferSelect;
export type NewPilotFeedback = typeof pilotFeedback.$inferInsert;

