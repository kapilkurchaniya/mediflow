/**
 * Conflict Management: Audited Batch Reallocation & Case Dismissal. (Lane A)
 * Enforces atomic dual stock movements, strict available-stock checks, and evidence requirements.
 */
import { and, eq, inArray } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { recordStockMovement } from "@/server/domain/stock";

export async function resolveWithBatchReallocation(
  db: DbOrTx,
  params: {
    tenantId: string;
    storeId: string;
    conflictCaseId: string;
    targetBatchId: string;
    reallocateQty: number;
    userId: string;
    dispensingEvidence: string;
    operationKey: string;
  },
) {
  if (!params.dispensingEvidence || params.dispensingEvidence.trim().length < 5) {
    throw new DomainError("EVIDENCE_REQUIRED", "Dispensing evidence description is required");
  }
  if (params.reallocateQty <= 0) {
    throw new DomainError("INVALID_QTY", "Reallocation quantity must be greater than zero");
  }

  return db.transaction(async (tx) => {
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

    // Lock both batches in ascending UUID order to prevent deadlocks
    const batchIds = [conflictCase.batchId, params.targetBatchId].sort();
    const lockedBatches = await tx
      .select()
      .from(schema.batches)
      .where(inArray(schema.batches.id, batchIds))
      .orderBy(schema.batches.id)
      .for("update");

    const sourceBatch = lockedBatches.find((b) => b.id === conflictCase.batchId);
    const targetBatch = lockedBatches.find((b) => b.id === params.targetBatchId);

    if (!sourceBatch || !targetBatch) {
      throw new DomainError("BATCH_NOT_FOUND", "Batches for reallocation not found");
    }

    if (targetBatch.medicineId !== conflictCase.medicineId) {
      throw new DomainError("MEDICINE_MISMATCH", "Target batch must be of the same medicine");
    }
    if (targetBatch.status !== "active") {
      throw new DomainError("BATCH_INACTIVE", "Target batch is not active");
    }
    if (new Date(targetBatch.expiryDate) < new Date()) {
      throw new DomainError("BATCH_EXPIRED", "Target batch is expired");
    }

    const availableStock = targetBatch.qtyOnHand;
    if (availableStock < params.reallocateQty) {
      throw new DomainError(
        "INSUFFICIENT_STOCK",
        `Target batch only has ${availableStock} units available`,
      );
    }

    // Dual stock movements
    await recordStockMovement({
      tx,
      tenantId: params.tenantId,
      storeId: params.storeId,
      batchId: targetBatch.id,
      medicineId: conflictCase.medicineId,
      type: "adjustment",
      qtyChange: -params.reallocateQty,
      userId: params.userId,
      refType: "reallocation_source",
      note: `Reallocation to batch ${sourceBatch.batchNo}. Evidence: ${params.dispensingEvidence}`,
    });

    await recordStockMovement({
      tx,
      tenantId: params.tenantId,
      storeId: params.storeId,
      batchId: sourceBatch.id,
      medicineId: conflictCase.medicineId,
      type: "adjustment",
      qtyChange: params.reallocateQty,
      userId: params.userId,
      refType: "reallocation_target",
      note: `Reallocated from batch ${targetBatch.batchNo}. Evidence: ${params.dispensingEvidence}`,
    });

    await tx.insert(schema.stockConflictResolutions).values({
      tenantId: params.tenantId,
      conflictCaseId: conflictCase.id,
      operationKey: params.operationKey,
      resolutionType: "batch_reallocation",
      reconciledQty: params.reallocateQty,
      sourceBatchId: sourceBatch.id,
      targetBatchId: targetBatch.id,
      evidenceNotes: params.dispensingEvidence,
      performedBy: params.userId,
    });

    const newReconciled = conflictCase.reconciledQty + params.reallocateQty;
    const isResolved = newReconciled >= conflictCase.requiredReconciliationQty;
    const newStatus = isResolved ? "resolved" : "partially_resolved";

    await tx
      .update(schema.stockConflictCases)
      .set({
        reconciledQty: newReconciled,
        status: newStatus,
        resolvedAt: isResolved ? new Date() : null,
        resolvedBy: isResolved ? params.userId : null,
        resolutionType: "batch_reallocation",
        resolutionNotes: params.dispensingEvidence,
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
        newValue: { status: newStatus, targetBatchId: targetBatch.id, qty: params.reallocateQty },
        reason: params.dispensingEvidence,
      },
    );

    return { success: true, caseId: conflictCase.id, status: newStatus };
  });
}

export async function dismissConflictCase(
  db: DbOrTx,
  params: {
    tenantId: string;
    storeId: string;
    conflictCaseId: string;
    userId: string;
    reason: string;
    operationKey: string;
  },
) {
  if (!params.reason || params.reason.trim().length < 5) {
    throw new DomainError(
      "REASON_REQUIRED",
      "A dismissal reason of at least 5 characters is required",
    );
  }

  return db.transaction(async (tx) => {
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

    await tx.insert(schema.stockConflictResolutions).values({
      tenantId: params.tenantId,
      conflictCaseId: conflictCase.id,
      operationKey: params.operationKey,
      resolutionType: "dismissal",
      reconciledQty: 0,
      evidenceNotes: params.reason,
      performedBy: params.userId,
    });

    await tx
      .update(schema.stockConflictCases)
      .set({
        status: "dismissed",
        resolvedAt: new Date(),
        resolvedBy: params.userId,
        resolutionType: "dismissal",
        resolutionNotes: params.reason,
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
        newValue: { status: "dismissed" },
        reason: params.reason,
      },
    );

    return { success: true, caseId: conflictCase.id, status: "dismissed" };
  });
}
