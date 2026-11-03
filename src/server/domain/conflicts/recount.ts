/**
 * Conflict Management: Physical Recount & Shortage Reconciliation. (Lane A)
 * Enforces non-fabricating reconciliation offsets for confirmed zero shelf stock.
 */
import { and, eq } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { recordStockMovement } from "@/server/domain/stock";

export async function resolveWithPhysicalRecount(
  db: DbOrTx,
  params: {
    tenantId: string;
    storeId: string;
    conflictCaseId: string;
    observedCount: number;
    userId: string;
    notes?: string;
    operationKey: string;
  },
) {
  return db.transaction(async (tx) => {
    // 1. Lock conflict case
    const [conflictCase] = await tx
      .select()
      .from(schema.stockConflictCases)
      .where(
        and(
          eq(schema.stockConflictCases.id, params.conflictCaseId),
          eq(schema.stockConflictCases.tenantId, params.tenantId),
          eq(schema.stockConflictCases.storeId, params.storeId),
        ),
      )
      .for("update");

    if (!conflictCase) {
      throw new DomainError("CONFLICT_NOT_FOUND", "Conflict case not found");
    }

    if (conflictCase.status === "resolved" || conflictCase.status === "dismissed") {
      return { success: true, caseId: conflictCase.id, status: conflictCase.status };
    }

    // 2. Lock batch
    const [batch] = await tx
      .select()
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.id, conflictCase.batchId),
          eq(schema.batches.tenantId, params.tenantId),
          eq(schema.batches.storeId, params.storeId),
        ),
      )
      .for("update");

    if (!batch) {
      throw new DomainError("BATCH_NOT_FOUND", "Batch not found");
    }

    const outstanding = Math.max(
      0,
      conflictCase.requiredReconciliationQty - conflictCase.reconciledQty,
    );
    let reconciledQty = 0;
    let resolutionType: string;

    if (params.observedCount > 0) {
      // Discovered positive physical stock
      const qtyChange = params.observedCount - batch.qtyOnHand;
      await recordStockMovement({
        tx,
        tenantId: params.tenantId,
        storeId: params.storeId,
        batchId: batch.id,
        medicineId: conflictCase.medicineId,
        type: "adjustment",
        qtyChange,
        userId: params.userId,
        note: `Physical count discovery: observed ${params.observedCount} units. ${params.notes || ""}`,
      });
      reconciledQty = Math.min(outstanding, qtyChange);
      resolutionType = "physical_recount";
    } else {
      // Confirmed zero physical stock -> non-fabricating reconciliation offset
      const deficit = Math.max(0, -batch.qtyOnHand);
      await recordStockMovement({
        tx,
        tenantId: params.tenantId,
        storeId: params.storeId,
        batchId: batch.id,
        medicineId: conflictCase.medicineId,
        type: "adjustment",
        refType: "conflict_reconciliation",
        qtyChange: deficit,
        userId: params.userId,
        note: `Zero physical stock confirmed: offset ledger balance to 0. ${params.notes || ""}`,
      });
      reconciledQty = Math.min(outstanding, deficit);
      resolutionType = "shortage_reconciliation";
    }

    // Record resolution record
    await tx.insert(schema.stockConflictResolutions).values({
      tenantId: params.tenantId,
      conflictCaseId: conflictCase.id,
      operationKey: params.operationKey,
      resolutionType,
      reconciledQty,
      evidenceNotes: params.notes ?? null,
      performedBy: params.userId,
    });

    const newReconciled = conflictCase.reconciledQty + reconciledQty;
    const isResolved = newReconciled >= conflictCase.requiredReconciliationQty;
    const newStatus = isResolved ? "resolved" : "partially_resolved";

    await tx
      .update(schema.stockConflictCases)
      .set({
        reconciledQty: newReconciled,
        status: newStatus,
        resolvedAt: isResolved ? new Date() : null,
        resolvedBy: isResolved ? params.userId : null,
        resolutionType,
        resolutionNotes: params.notes,
        updatedAt: new Date(),
      })
      .where(eq(schema.stockConflictCases.id, conflictCase.id));

    await writeAudit(
      tx,
      { tenantId: params.tenantId, storeId: params.storeId, userId: params.userId },
      {
        action: "update",
        entityType: "stock_conflict",
        entityId: conflictCase.id,
        newValue: { status: newStatus, resolutionType, reconciledQty },
        reason: params.notes,
      },
    );

    return { success: true, caseId: conflictCase.id, status: newStatus };
  });
}
