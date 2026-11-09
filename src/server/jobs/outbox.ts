/**
 * src/server/jobs/outbox.ts
 *
 * Transactional outbox worker & background queue (B2.1).
 * Allows asynchronous tasks (WhatsApp, SMS, reminders, e-invoice retries)
 * to be recorded within a database transaction and executed reliably
 * with retry and exponential backoff after the transaction commits.
 */

import { db, schema, type DbOrTx } from "@/server/db";
import { eq, and, sql, lte, or, isNull } from "drizzle-orm";
import { handlers } from "./handlers";
import { recordWorkerStart, recordWorkerSuccess, recordWorkerFailure } from "@/server/observability/heartbeat";
import { runWithJobContext } from "@/server/logging/context";

export type OutboxType =
  | "whatsapp.receipt"
  | "whatsapp.payment_reminder"
  | "sms.send"
  | "reminder.send"
  | "gst.doc_retry"
  | "einvoice.generate";

export interface EnqueueOptions {
  runAt?: Date;
}

/**
 * Enqueues an outbox event within a transaction or database handle.
 * Always call within the same `tx` as the business mutation.
 */
export async function enqueue(
  tx: DbOrTx,
  tenantId: string,
  type: OutboxType,
  payload: Record<string, unknown>,
  options?: EnqueueOptions
) {
  const [event] = await tx
    .insert(schema.outboxEvents)
    .values({
      tenantId,
      type,
      payload,
      status: "pending",
      attempts: 0,
      nextAttemptAt: options?.runAt ?? new Date(),
    })
    .returning();

  return event;
}

export interface ProcessResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: Array<{ id: number; type: string; error: string }>;
}

const MAX_ATTEMPTS = 8;

/**
 * Calculate exponential backoff duration in milliseconds.
 * 2^attempts * 5s, capped at 1 hour.
 */
export function calculateBackoffMs(attempts: number): number {
  const baseMs = 5000;
  const maxMs = 3600000; // 1 hour
  return Math.min(Math.pow(2, attempts) * baseMs, maxMs);
}

/**
 * Processes a batch of pending outbox events using SKIP LOCKED for safe concurrent worker execution.
 */
export async function processOutbox(limit = 25): Promise<ProcessResult> {
  return runWithJobContext("outbox_worker", async () => {
    await recordWorkerStart(db, "outbox_worker", { batchSize: limit }).catch(() => {});
    const now = new Date();
    const result: ProcessResult = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: [],
    };

  // 1. Fetch and lock pending events whose run time has arrived
  const candidateEvents = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.outboxEvents)
      .where(
        and(
          eq(schema.outboxEvents.status, "pending"),
          sql`${schema.outboxEvents.attempts} < ${MAX_ATTEMPTS}`,
          or(
            isNull(schema.outboxEvents.nextAttemptAt),
            lte(schema.outboxEvents.nextAttemptAt, now)
          )
        )
      )
      .orderBy(schema.outboxEvents.id)
      .limit(limit)
      .for("update", { skipLocked: true });

    return rows;
  });

  if (candidateEvents.length === 0) {
    return result;
  }

  // 2. Process each event independently so a single failure does not rollback the entire batch
  for (const ev of candidateEvents) {
    result.processed++;
    const handler = handlers[ev.type as OutboxType];

    if (!handler) {
      const errMsg = `No registered handler for outbox type '${ev.type}'`;
      await db
        .update(schema.outboxEvents)
        .set({
          status: "failed",
          lastError: errMsg,
          processedAt: new Date(),
        })
        .where(eq(schema.outboxEvents.id, ev.id));

      result.failed++;
      result.errors.push({ id: ev.id, type: ev.type, error: errMsg });
      continue;
    }

    try {
      await handler({ ...ev, payload: (ev.payload ?? {}) as Record<string, unknown> });

      await db
        .update(schema.outboxEvents)
        .set({
          status: "done",
          processedAt: new Date(),
          lastError: null,
        })
        .where(eq(schema.outboxEvents.id, ev.id));

      result.succeeded++;
    } catch (err: unknown) {
      const errorMsg = (err instanceof Error ? err.message : String(err)) || "Unknown handler error";
      const newAttempts = ev.attempts + 1;
      const isExhausted = newAttempts >= MAX_ATTEMPTS;
      const backoffMs = calculateBackoffMs(newAttempts);
      const nextAttemptAt = isExhausted ? null : new Date(Date.now() + backoffMs);

      await db
        .update(schema.outboxEvents)
        .set({
          attempts: newAttempts,
          status: isExhausted ? "failed" : "pending",
          lastError: errorMsg,
          nextAttemptAt,
          ...(isExhausted ? { processedAt: new Date() } : {}),
        })
        .where(eq(schema.outboxEvents.id, ev.id));

      result.failed++;
      result.errors.push({ id: ev.id, type: ev.type, error: errorMsg });
    }
  }

  if (result.failed > 0 && result.succeeded === 0 && result.processed > 0) {
    await recordWorkerFailure(db, "outbox_worker", { processed: result.processed, failed: result.failed }).catch(() => {});
  } else {
    await recordWorkerSuccess(db, "outbox_worker", {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
    }).catch(() => {});
  }

  return result;
});
}
