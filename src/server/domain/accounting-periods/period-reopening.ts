/**
 * Transactional Accounting Period Reopening.
 * Acquires row-level FOR UPDATE lock, validates master lock status,
 * transitions period back to open, and logs immutable reopen audit event.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { accountingPeriods, accountingPeriodEvents } from "@/server/db/schema";
import { computePeriodSnapshot } from "./close-validation";
import type { AccountingPeriod, AccountingPeriodEvent, PeriodSnapshot } from "./types";

export interface ReopenAccountingPeriodParams {
  tenantId: string;
  periodId: string;
  performedBy: string;
  reason: string;
}

export interface ReopenAccountingPeriodResult {
  period: AccountingPeriod;
  event: AccountingPeriodEvent;
  snapshot: PeriodSnapshot;
}

export async function reopenAccountingPeriod(
  tx: DbOrTx,
  params: ReopenAccountingPeriodParams,
): Promise<ReopenAccountingPeriodResult> {
  // 1. Acquire row-level lock FOR UPDATE on period row
  const [period] = await tx
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.id, params.periodId), eq(accountingPeriods.tenantId, params.tenantId)))
    .for("update");

  if (!period) {
    throw new Error(`Accounting period ${params.periodId} not found.`);
  }

  if (period.status === "open") {
    throw new Error(`Accounting period ${period.periodKey} is already open.`);
  }

  // 2. If reopening a secondary GSTIN period, ensure tenant master period is open
  if (period.gstin) {
    const [master] = await tx
      .select()
      .from(accountingPeriods)
      .where(
        and(
          eq(accountingPeriods.tenantId, params.tenantId),
          eq(accountingPeriods.periodKey, period.periodKey),
          isNull(accountingPeriods.gstin),
        ),
      );

    if (master && master.status === "locked") {
      throw new Error(
        `Cannot reopen GSTIN period ${period.periodKey} while master period is locked. Reopen the tenant master period first.`,
      );
    }
  }

  // 3. Compute snapshot at time of reopen
  const snapshot = await computePeriodSnapshot(tx, params.tenantId, period, params.performedBy);

  // 4. Determine next event sequence under the lock
  const seqRes = await tx.execute(sql`
    SELECT COALESCE(MAX(event_sequence), 0)::int as max_seq
    FROM accounting_period_events
    WHERE period_id = ${period.id}
  `);
  const nextSequence = Number(seqRes.rows[0]?.max_seq ?? 0) + 1;

  // 5. Update period status to open
  const now = new Date();
  const [updatedPeriod] = await tx
    .update(accountingPeriods)
    .set({
      status: "open",
      lockedAt: null,
      lockedBy: null,
      lockNote: null,
      updatedAt: now,
    })
    .where(eq(accountingPeriods.id, period.id))
    .returning();

  // 6. Insert immutable reopen event
  const [event] = await tx
    .insert(accountingPeriodEvents)
    .values({
      tenantId: params.tenantId,
      periodId: period.id,
      eventType: "reopen",
      eventSequence: nextSequence,
      reason: params.reason,
      snapshot,
      performedBy: params.performedBy,
      performedAt: now,
    })
    .returning();

  return {
    period: updatedPeriod,
    event,
    snapshot,
  };
}
