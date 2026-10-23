DROP INDEX "outbox_pending_idx";--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_events" USING btree ("status","next_attempt_at","id");