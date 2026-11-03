import { schema, type Tx } from "@/server/db";
import { and, eq, gt } from "drizzle-orm";
import { DomainError } from "@/server/errors";
import { nextDocNumber } from "@/server/domain/sequence";
import { format } from "date-fns";
import { getOrSeedAccounts } from "@/server/domain/accounting";
import { writeAudit } from "@/server/audit";
import { calculateReconciliationDelta } from "./reconcile";
import type { ApproveAuditSessionParams } from "./types";

/**
 * Reconciles and posts an approved physical stocktake audit session.
 * 1. Locks affected batch rows deterministically.
 * 2. Uses movement-aware reconciliation (F = C + M_after) to calculate adjustments.
 * 3. Updates live batch quantities and inserts immutable stock movements.
 * 4. Posts balanced double-entry financial journal entry for shortage/excess.
 * 5. Records an immutable audit log entry.
 */
export async function approveStockAuditSession(
  tx: Tx,
  params: ApproveAuditSessionParams
) {
  const { tenantId, storeId, sessionId, userId, notes } = params;

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
    .limit(1);

  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Audit session not found");
  }

  if (session.status === "approved") {
    throw new DomainError(
      "ALREADY_APPROVED",
      "This audit session has already been approved and reconciled"
    );
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

  for (const item of items) {
    // 1. Lock batch row
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

    // 2. Query movements that occurred strictly after physical observation
    let netMovementsAfterCount = 0;
    if (item.countedAt) {
      const interimMovements = await tx
        .select({ qtyChange: schema.stockMovements.qtyChange })
        .from(schema.stockMovements)
        .where(
          and(
            eq(schema.stockMovements.batchId, batch.id),
            eq(schema.stockMovements.storeId, storeId),
            gt(schema.stockMovements.createdAt, item.countedAt)
          )
        );

      netMovementsAfterCount = interimMovements.reduce(
        (sum, m) => sum + m.qtyChange,
        0
      );
    }

    // 3. Deterministic movement-aware calculation: F = Math.max(0, C + M_after)
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

    const newStatus = finalBalance === 0 ? "hold" : batch.status;

    // 4. Update batch stock
    await tx
      .update(schema.batches)
      .set({ qtyOnHand: finalBalance, status: newStatus })
      .where(eq(schema.batches.id, batch.id));

    // 5. Insert immutable stock movement
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

    // Mark line reconciled
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

  // 6. Double-entry financial journal voucher for net financial impact
  const netFinancialImpactPaise = totalExcessPaise - totalShortagePaise;
  const accounts = await getOrSeedAccounts(tx, tenantId);
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  if (Math.abs(netFinancialImpactPaise) > 0) {
    const entryNo = await nextDocNumber(
      tx,
      tenantId,
      storeId,
      "journal",
      "JV"
    );

    const [jv] = await tx
      .insert(schema.journalEntries)
      .values({
        tenantId,
        storeId,
        entryNo,
        entryDate: todayStr,
        narration: `Physical stocktake reconciliation for session ${session.sessionNo}`,
        refType: "stock_audit_session",
        refId: session.id,
        createdBy: userId,
      })
      .returning({ id: schema.journalEntries.id });

    // Net Shortage: Debit Expense (purchases 4010), Credit Inventory Asset (inventory 1080)
    if (netFinancialImpactPaise < 0) {
      const shortageAmount = Math.abs(netFinancialImpactPaise);
      if (accounts.purchases && accounts.inventory) {
        await tx.insert(schema.journalLines).values([
          {
            tenantId,
            entryId: jv.id,
            accountId: accounts.purchases,
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
      // Net Excess: Debit Inventory Asset (inventory 1080), Credit Income (discounts 3020)
      const excessAmount = netFinancialImpactPaise;
      if (accounts.inventory && accounts.discounts) {
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
            accountId: accounts.discounts,
            debit: 0,
            credit: excessAmount,
          },
        ]);
      }
    }
  }

  // 7. Write immutable audit log
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

  // 8. Update session to approved
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
