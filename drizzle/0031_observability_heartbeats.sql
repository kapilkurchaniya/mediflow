-- Custom SQL migration for Phase 6.1: Observability Worker Heartbeats
CREATE TABLE IF NOT EXISTS "worker_heartbeats" (
  "worker_name" text PRIMARY KEY NOT NULL,
  "status" text NOT NULL,
  "last_started_at" timestamp with time zone,
  "last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_success_at" timestamp with time zone,
  "last_error_at" timestamp with time zone,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "meta" jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "chk_worker_heartbeat_status" CHECK ("status" IN ('idle', 'running', 'ok', 'failed'))
);

CREATE INDEX IF NOT EXISTS "idx_worker_heartbeats_status" 
ON "worker_heartbeats" ("status", "last_heartbeat_at");
