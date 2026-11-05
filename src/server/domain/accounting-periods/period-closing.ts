/**
 * Transactional Accounting Period Closing.
 * Acquires row-level FOR UPDATE lock, runs pre-close validation,
 * records immutable snapshot and append-only audit event.
 */
import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { accountingPeriods, accountingPeriodEvents } from "@/server/db/schema";
import { validatePeriodCanBeClosed } from "./close-validation";
import type { AccountingPeriod, AccountingPeriodEvent, PeriodSnapshot } from "./types";

export interface CloseAccountingPeriodParams {
  tenantId: string;
  periodId: string;
  performedBy: string;
  reason: string;
  force?: boolean;
}

export interface CloseAccountingPeriodResult {
  period: AccountingPeriod;
  event: AccountingPeriodEvent;
  snapshot: PeriodSnapshot;
}

export async function closeAccountingPeriod(
  tx: DbOrTx,
  params: CloseAccountingPeriodParams,
): Promise<CloseAccountingPeriodResult> {
  // 1. Acquire row-level lock FOR UPDATE on period row
  const [period] = await tx
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.id, params.periodId), eq(accountingPeriods.tenantId, params.tenantId)))
    .for("update");

  if (!period) {
    throw new Error(`Accounting period ${params.periodId} not found.`);
  }

  if (period.status === "locked") {
    throw new Error(`Accounting period ${period.periodKey} is already locked.`);
  }

  // 2. Validate period can be closed
  const validation = await validatePeriodCanBeClosed(tx, params.tenantId, period, params.performedBy);
  if (!validation.canClose && !params.force) {
    throw new Error(`Cannot lock period ${period.periodKey}: ${validation.blockers.join(" ")}`);
  }

  // 3. Determine next event sequence under the lock
  const seqRes = await tx.execute(sql`
    SELECT COALESCE(MAX(event_sequence), 0)::int as max_seq
    FROM accounting_period_events
    WHERE period_id = ${period.id}
  `);
  const nextSequence = Number(seqRes.rows[0]?.max_seq ?? 0) + 1;

  // 4. Update period status to locked
  const now = new Date();
  const [updatedPeriod] = await tx
    .update(accountingPeriods)
    .set({
      status: "locked",
      lockedAt: now,
      lockedBy: params.performedBy,
      lockNote: params.reason,
      closingSnapshot: validation.snapshot,
      updatedAt: now,
    })
    .where(eq(accountingPeriods.id, period.id))
    .returning();

  // 5. Insert immutable audit event
  const [event] = await tx
    .insert(accountingPeriodEvents)
    .values({
      tenantId: params.tenantId,
      periodId: period.id,
      eventType: "lock",
      eventSequence: nextSequence,
      reason: params.reason,
      snapshot: validation.snapshot,
      performedBy: params.performedBy,
      performedAt: now,
    })
    .returning();

  return {
    period: updatedPeriod,
    event,
    snapshot: validation.snapshot,
  };
}
