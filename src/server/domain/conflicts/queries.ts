/**
 * Conflict Management Queries: Listing, details, and investigation status. (Lane A)
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";
import { DomainError } from "@/server/errors";

export interface ConflictFilter {
  tenantId: string;
  storeId: string;
  status?: string;
}

export async function listStoreConflicts(db: DbOrTx, filter: ConflictFilter) {
  const conditions = [
    eq(schema.stockConflictCases.tenantId, filter.tenantId),
    eq(schema.stockConflictCases.storeId, filter.storeId),
  ];

  if (filter.status && filter.status !== "all") {
    conditions.push(eq(schema.stockConflictCases.status, filter.status));
  }

  const cases = await db
    .select({
      id: schema.stockConflictCases.id,
      tenantId: schema.stockConflictCases.tenantId,
      storeId: schema.stockConflictCases.storeId,
      batchId: schema.stockConflictCases.batchId,
      medicineId: schema.stockConflictCases.medicineId,
      status: schema.stockConflictCases.status,
      requiredReconciliationQty: schema.stockConflictCases.requiredReconciliationQty,
      reconciledQty: schema.stockConflictCases.reconciledQty,
      openedAt: schema.stockConflictCases.openedAt,
      resolvedAt: schema.stockConflictCases.resolvedAt,
      resolutionType: schema.stockConflictCases.resolutionType,
      resolutionNotes: schema.stockConflictCases.resolutionNotes,
      batchNo: schema.batches.batchNo,
      expiryDate: schema.batches.expiryDate,
      qtyOnHand: schema.batches.qtyOnHand,
      medicineName: schema.medicines.name,
    })
    .from(schema.stockConflictCases)
    .innerJoin(schema.batches, eq(schema.stockConflictCases.batchId, schema.batches.id))
    .innerJoin(schema.medicines, eq(schema.stockConflictCases.medicineId, schema.medicines.id))
    .where(and(...conditions))
    .orderBy(desc(schema.stockConflictCases.openedAt));

  return cases.map((c) => ({
    ...c,
    outstandingQty: Math.max(0, c.requiredReconciliationQty - c.reconciledQty),
  }));
}

export async function getConflictDetails(
  db: DbOrTx,
  params: { tenantId: string; storeId: string; conflictCaseId: string },
) {
  const [conflictCase] = await db
    .select({
      id: schema.stockConflictCases.id,
      tenantId: schema.stockConflictCases.tenantId,
      storeId: schema.stockConflictCases.storeId,
      batchId: schema.stockConflictCases.batchId,
      medicineId: schema.stockConflictCases.medicineId,
      status: schema.stockConflictCases.status,
      requiredReconciliationQty: schema.stockConflictCases.requiredReconciliationQty,
      reconciledQty: schema.stockConflictCases.reconciledQty,
      openedAt: schema.stockConflictCases.openedAt,
      resolvedAt: schema.stockConflictCases.resolvedAt,
      resolutionType: schema.stockConflictCases.resolutionType,
      resolutionNotes: schema.stockConflictCases.resolutionNotes,
      batchNo: schema.batches.batchNo,
      expiryDate: schema.batches.expiryDate,
      qtyOnHand: schema.batches.qtyOnHand,
      medicineName: schema.medicines.name,
    })
    .from(schema.stockConflictCases)
    .innerJoin(schema.batches, eq(schema.stockConflictCases.batchId, schema.batches.id))
    .innerJoin(schema.medicines, eq(schema.stockConflictCases.medicineId, schema.medicines.id))
    .where(
      and(
        eq(schema.stockConflictCases.id, params.conflictCaseId),
        eq(schema.stockConflictCases.tenantId, params.tenantId),
        eq(schema.stockConflictCases.storeId, params.storeId),
      ),
    )
    .limit(1);

  if (!conflictCase) {
    throw new DomainError("CONFLICT_NOT_FOUND", "Conflict case not found");
  }

  const contributions = await db
    .select()
    .from(schema.stockConflictContributions)
    .where(eq(schema.stockConflictContributions.conflictCaseId, conflictCase.id))
    .orderBy(desc(schema.stockConflictContributions.syncedAt));

  const resolutions = await db
    .select({
      id: schema.stockConflictResolutions.id,
      operationKey: schema.stockConflictResolutions.operationKey,
      resolutionType: schema.stockConflictResolutions.resolutionType,
      reconciledQty: schema.stockConflictResolutions.reconciledQty,
      evidenceNotes: schema.stockConflictResolutions.evidenceNotes,
      createdAt: schema.stockConflictResolutions.createdAt,
      performedByName: schema.users.name,
    })
    .from(schema.stockConflictResolutions)
    .innerJoin(schema.users, eq(schema.stockConflictResolutions.performedBy, schema.users.id))
    .where(eq(schema.stockConflictResolutions.conflictCaseId, conflictCase.id))
    .orderBy(desc(schema.stockConflictResolutions.createdAt));

  const today = new Date().toISOString().split("T")[0];
  const alternativeBatches = await db
    .select()
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.tenantId, params.tenantId),
        eq(schema.batches.storeId, params.storeId),
        eq(schema.batches.medicineId, conflictCase.medicineId),
        sql`${schema.batches.id} != ${conflictCase.batchId}`,
        eq(schema.batches.status, "active"),
        sql`${schema.batches.qtyOnHand} > 0`,
        sql`${schema.batches.expiryDate} >= ${today}`,
      ),
    )
    .orderBy(schema.batches.expiryDate);

  return {
    conflictCase: {
      ...conflictCase,
      outstandingQty: Math.max(
        0,
        conflictCase.requiredReconciliationQty - conflictCase.reconciledQty,
      ),
    },
    contributions,
    resolutions,
    alternativeBatches,
  };
}

export async function setConflictInvestigating(
  db: DbOrTx,
  params: { tenantId: string; storeId: string; conflictCaseId: string; userId: string },
) {
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

    if (conflictCase && conflictCase.status === "open") {
      await tx
        .update(schema.stockConflictCases)
        .set({ status: "investigating", updatedAt: new Date() })
        .where(eq(schema.stockConflictCases.id, conflictCase.id));
    }
  });
}
