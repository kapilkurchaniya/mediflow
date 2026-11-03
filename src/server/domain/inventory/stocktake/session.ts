import { schema, type DbOrTx, type Tx } from "@/server/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { DomainError } from "@/server/errors";
import { nextDocNumber } from "@/server/domain/sequence";
import type { CreateAuditSessionParams } from "./types";

/**
 * Creates a physical stocktake audit session.
 * Snapshots active batches matching the scope (full store or selected store racks)
 * into immutable audit items for verification.
 *
 * NOTE: Resolves rack locations strictly through store_medicine_settings for the
 * target store, eliminating legacy catalog rack leakage across stores.
 */
export async function createStockAuditSession(
  tx: Tx,
  params: CreateAuditSessionParams
) {
  const {
    tenantId,
    storeId,
    scope,
    rackIds = [],
    blindCount = true,
    notes,
    userId,
  } = params;

  if (scope === "racks" && rackIds.length === 0) {
    throw new DomainError(
      "EMPTY_RACKS",
      "At least one rack must be selected for a rack audit"
    );
  }

  // 1. Generate session number: AUD/26-27/000001
  const sessionNo = await nextDocNumber(
    tx,
    tenantId,
    storeId,
    "audit_session",
    "AUD"
  );

  // 2. Insert session header
  const [session] = await tx
    .insert(schema.stockAuditSessions)
    .values({
      tenantId,
      storeId,
      sessionNo,
      scope,
      rackIds,
      blindCount,
      status: "in_progress",
      notes:
        notes ||
        `Audit session for ${
          scope === "full_store"
            ? "entire store"
            : `${rackIds.length} racks`
        }`,
      startedBy: userId,
    })
    .returning();

  // 3. Query matching active batches for this store, resolving store-specific racks
  const conditions = [
    eq(schema.batches.tenantId, tenantId),
    eq(schema.batches.storeId, storeId),
    eq(schema.batches.status, "active"),
    eq(schema.medicines.isActive, true),
  ];

  if (scope === "racks") {
    conditions.push(inArray(schema.storeMedicineSettings.rackId, rackIds));
  }

  const activeBatches = await tx
    .select({
      batch: schema.batches,
      medicine: schema.medicines,
      storeSetting: schema.storeMedicineSettings,
    })
    .from(schema.batches)
    .innerJoin(
      schema.medicines,
      eq(schema.batches.medicineId, schema.medicines.id)
    )
    .leftJoin(
      schema.storeMedicineSettings,
      and(
        eq(schema.storeMedicineSettings.medicineId, schema.medicines.id),
        eq(schema.storeMedicineSettings.storeId, storeId)
      )
    )
    .where(and(...conditions))
    .orderBy(schema.medicines.name, schema.batches.expiryDate);

  // 4. Create snapshot items with store-specific rack assignment
  for (const row of activeBatches) {
    const cost = row.batch.purchaseRate || 0;
    const resolvedRackId = row.storeSetting?.rackId ?? null;

    await tx.insert(schema.stockAuditItems).values({
      tenantId,
      sessionId: session.id,
      batchId: row.batch.id,
      medicineId: row.medicine.id,
      rackId: resolvedRackId,
      systemQty: row.batch.qtyOnHand,
      countedQty: null,
      varianceQty: null,
      unitCostPaise: cost,
      varianceCostPaise: 0,
      status: "pending",
    });
  }

  return {
    sessionId: session.id,
    sessionNo: session.sessionNo,
    totalItemsSnapshotted: activeBatches.length,
  };
}

/**
 * Cancels an ongoing audit session.
 */
export async function cancelStockAuditSession(
  tx: Tx,
  params: {
    tenantId: string;
    storeId: string;
    sessionId: string;
    userId: string;
  }
) {
  const { tenantId, storeId, sessionId } = params;

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
      "Cannot cancel an approved audit session"
    );
  }

  const [cancelled] = await tx
    .update(schema.stockAuditSessions)
    .set({
      status: "cancelled",
    })
    .where(eq(schema.stockAuditSessions.id, sessionId))
    .returning();

  return cancelled;
}

/**
 * Lists audit sessions for store.
 */
export async function listStockAuditSessions(
  dbOrTx: DbOrTx,
  params: { tenantId: string; storeId?: string }
) {
  const conditions = [
    eq(schema.stockAuditSessions.tenantId, params.tenantId),
  ];

  if (params.storeId) {
    conditions.push(eq(schema.stockAuditSessions.storeId, params.storeId));
  }

  const rows = await dbOrTx
    .select({
      session: schema.stockAuditSessions,
      store: schema.stores,
    })
    .from(schema.stockAuditSessions)
    .innerJoin(
      schema.stores,
      eq(schema.stockAuditSessions.storeId, schema.stores.id)
    )
    .where(and(...conditions))
    .orderBy(desc(schema.stockAuditSessions.createdAt));

  return rows.map((r) => ({
    id: r.session.id,
    sessionNo: r.session.sessionNo,
    storeId: r.session.storeId,
    storeName: r.store.name,
    storeCode: r.store.code,
    scope: r.session.scope,
    rackIds: r.session.rackIds,
    blindCount: r.session.blindCount,
    status: r.session.status,
    notes: r.session.notes,
    createdAt: r.session.createdAt,
    approvedAt: r.session.approvedAt,
  }));
}
