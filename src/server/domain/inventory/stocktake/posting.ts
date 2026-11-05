import { schema, type Tx } from "@/server/db";
import { and, eq, gt, isNull, ne, or } from "drizzle-orm";
import { DomainError } from "@/server/errors";
import { nextDocNumber } from "@/server/domain/sequence";
import { format } from "date-fns";
import { getOrSeedAccounts } from "@/server/domain/accounting";
import { writeAudit } from "@/server/audit";
import { calculateReconciliationDelta } from "./reconcile";
import type { ApproveAuditSessionParams } from "./types";
import { assertAccountingPeriodOpen } from "@/server/domain/accounting-periods";

/**
 * Reconciles and posts an approved physical stocktake audit session.
 * 1. Locks the audit session row (SELECT FOR UPDATE) to guarantee idempotency.
 * 2. Locks affected batch rows in deterministic sorted order (anti-deadlock).
 * 3. Uses movement-aware reconciliation (F = C + M_after) to calculate adjustments.
 * 4. Updates live batch quantities and inserts immutable stock movements.
 * 5. Posts balanced double-entry financial journal entry to dedicated adjustment accounts.
 * 6. Records an immutable audit log entry.
 */
export async function approveStockAuditSession(
  tx: Tx,
  params: ApproveAuditSessionParams
) {
  const { tenantId, storeId, sessionId, userId, notes } = params;

  // 1. Lock session row (concurrency guard & idempotency)
  const [session] = await tx
    .select()
    .from(schema.stockAuditSessions)
    .where(
      and(
        eq(schema.stockAuditSessions.id, sessionId),
        eq(schema.stockAuditSessions.tenantId, tenantId),
        eq(schema.stockAuditSessions.storeId, storeId)
      )
    )
    .limit(1)
    .for("update");

  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Audit session not found");
  }

  // Idempotent retry: return existing approved session without re-posting
  if (session.status === "approved") {
    return {
      sessionId: session.id,
      sessionNo: session.sessionNo,
      reconciledAdjustmentsCount: 0,
      totalShortagePaise: 0,
      totalExcessPaise: 0,
      netFinancialImpactPaise: 0,
      status: session.status,
    };
  }

  if (session.status === "cancelled") {
    throw new DomainError(
      "SESSION_CANCELLED",
      "Cannot approve a cancelled audit session"
    );
  }

  const items = await tx
    .select()
    .from(schema.stockAuditItems)
    .where(
      and(
        eq(schema.stockAuditItems.sessionId, sessionId),
        eq(schema.stockAuditItems.tenantId, tenantId)
      )
    );

  const pendingItems = items.filter((i) => i.countedQty === null);
  if (pendingItems.length > 0) {
    throw new DomainError(
      "UNCOUNTED_ITEMS",
      `Cannot approve audit session. ${pendingItems.length} items have not yet been counted.`
    );
  }

  let totalShortagePaise = 0;
  let totalExcessPaise = 0;
  let reconciledAdjustmentsCount = 0;

  // Sort deterministically by batchId to eliminate deadlock risk
  const sortedItems = [...items].sort((a, b) => a.batchId.localeCompare(b.batchId));

  for (const item of sortedItems) {
    const [batch] = await tx
      .select()
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.id, item.batchId),
          eq(schema.batches.tenantId, tenantId),
          eq(schema.batches.storeId, storeId)
        )
      )
      .for("update");

    if (!batch || item.countedQty === null) continue;

    // Query interim movements after observation cutoff, excluding stocktake adjustments
    let netMovementsAfterCount = 0;
    if (item.countedAt) {
      const interimMovements = await tx
        .select({ qtyChange: schema.stockMovements.qtyChange })
        .from(schema.stockMovements)
        .where(
          and(
            eq(schema.stockMovements.batchId, batch.id),
            eq(schema.stockMovements.storeId, storeId),
            gt(schema.stockMovements.createdAt, item.countedAt),
            or(
              isNull(schema.stockMovements.refId),
              ne(schema.stockMovements.refId, session.id)
            )
          )
        );

      netMovementsAfterCount = interimMovements.reduce(
        (sum, m) => sum + m.qtyChange,
        0
      );
    }

    const { finalBalance, adjustmentDelta, varianceCostPaise } =
      calculateReconciliationDelta({
        countedQty: item.countedQty,
        systemQtyAtSnapshot: item.systemQty,
        netMovementsAfterCount,
        currentQtyOnHand: batch.qtyOnHand,
        unitCostPaise: item.unitCostPaise,
      });

    if (adjustmentDelta === 0) {
      await tx
        .update(schema.stockAuditItems)
        .set({ status: "reconciled" })
        .where(eq(schema.stockAuditItems.id, item.id));
      continue;
    }

    // Preserve batch status (zero balance does not alter quarantine status)
    await tx
      .update(schema.batches)
      .set({ qtyOnHand: finalBalance })
      .where(eq(schema.batches.id, batch.id));

    await tx.insert(schema.stockMovements).values({
      tenantId,
      storeId,
      batchId: batch.id,
      medicineId: item.medicineId,
      type: "adjustment",
      qtyChange: adjustmentDelta,
      balanceAfter: finalBalance,
      unitCost: item.unitCostPaise,
      refType: "stock_audit_session",
      refId: session.id,
      note: `Physical audit variance adjustment (${adjustmentDelta > 0 ? `+${adjustmentDelta}` : adjustmentDelta}) [CNT/${session.sessionNo}]`,
      userId,
    });

    await tx
      .update(schema.stockAuditItems)
      .set({ status: "reconciled" })
      .where(eq(schema.stockAuditItems.id, item.id));

    if (adjustmentDelta < 0) {
      totalShortagePaise += Math.abs(varianceCostPaise);
    } else {
      totalExcessPaise += varianceCostPaise;
    }

    reconciledAdjustmentsCount++;
  }

  // Financial journal voucher using dedicated accounts
  const netFinancialImpactPaise = totalExcessPaise - totalShortagePaise;
  const accounts = await getOrSeedAccounts(tx, tenantId);
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  if (Math.abs(netFinancialImpactPaise) > 0) {
    await assertAccountingPeriodOpen(tx, { tenantId, entryDate: todayStr, storeId });
    const entryNo = await nextDocNumber(tx, tenantId, storeId, "journal", "JV");

    const narration = netFinancialImpactPaise < 0
      ? `Physical stocktake shortage loss for session ${session.sessionNo}`
      : `Physical stocktake surplus gain for session ${session.sessionNo}`;

    const [jv] = await tx
      .insert(schema.journalEntries)
      .values({
        tenantId,
        storeId,
        entryNo,
        entryDate: todayStr,
        narration,
        refType: "stock_audit_session",
        refId: session.id,
        createdBy: userId,
      })
      .returning({ id: schema.journalEntries.id });

    if (netFinancialImpactPaise < 0) {
      const shortageAmount = Math.abs(netFinancialImpactPaise);
      const debitAccount = accounts.stock_loss || accounts.purchases;
      if (debitAccount && accounts.inventory) {
        await tx.insert(schema.journalLines).values([
          {
            tenantId,
            entryId: jv.id,
            accountId: debitAccount,
            debit: shortageAmount,
            credit: 0,
          },
          {
            tenantId,
            entryId: jv.id,
            accountId: accounts.inventory,
            debit: 0,
            credit: shortageAmount,
          },
        ]);
      }
    } else {
      const excessAmount = netFinancialImpactPaise;
      const creditAccount = accounts.stock_gain || accounts.discounts;
      if (accounts.inventory && creditAccount) {
        await tx.insert(schema.journalLines).values([
          {
            tenantId,
            entryId: jv.id,
            accountId: accounts.inventory,
            debit: excessAmount,
            credit: 0,
          },
          {
            tenantId,
            entryId: jv.id,
            accountId: creditAccount,
            debit: 0,
            credit: excessAmount,
          },
        ]);
      }
    }
  }

  await writeAudit(
    tx,
    { tenantId, storeId, userId },
    {
      action: "stock_adjust",
      entityType: "stock_audit_session",
      entityId: session.id,
      newValue: {
        sessionNo: session.sessionNo,
        reconciledAdjustmentsCount,
        totalShortagePaise,
        totalExcessPaise,
        netFinancialImpactPaise,
        status: "approved",
      },
    }
  );

  const [approvedSession] = await tx
    .update(schema.stockAuditSessions)
    .set({
      status: "approved",
      approvedBy: userId,
      approvedAt: now,
      notes: notes ? `${session.notes || ""}\n${notes}` : session.notes,
    })
    .where(eq(schema.stockAuditSessions.id, sessionId))
    .returning();

  return {
    sessionId: approvedSession.id,
    sessionNo: approvedSession.sessionNo,
    reconciledAdjustmentsCount,
    totalShortagePaise,
    totalExcessPaise,
    netFinancialImpactPaise,
    status: approvedSession.status,
  };
}
