import { schema, type DbOrTx, type Tx } from "@/server/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { DomainError } from "@/server/errors";
import { nextDocNumber } from "@/server/domain/sequence";
import { format } from "date-fns";
import { getOrSeedAccounts } from "@/server/domain/accounting";

export interface CreateAuditSessionParams {
  tenantId: string;
  storeId: string;
  scope: "full_store" | "racks";
  rackIds?: string[];
  blindCount?: boolean;
  notes?: string;
  userId: string;
}

export interface RecordAuditCountsParams {
  tenantId: string;
  sessionId: string;
  counts: Array<{
    itemId: string;
    countedQty: number;
  }>;
  userId: string;
}

export interface ApproveAuditSessionParams {
  tenantId: string;
  storeId: string;
  sessionId: string;
  userId: string;
  notes?: string;
}

/**
 * Creates a physical stocktake audit session.
 * Snapshots active batches matching the scope (full store or selected racks)
 * into immutable audit items for verification.
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
    throw new DomainError("EMPTY_RACKS", "At least one rack must be selected for a rack audit");
  }

  // 1. Generate session number: AUD/26-27/000001
  const sessionNo = await nextDocNumber(tx, tenantId, storeId, "audit_session", "AUD");

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
      notes: notes || `Audit session for ${scope === "full_store" ? "entire store" : `${rackIds.length} racks`}`,
      startedBy: userId,
    })
    .returning();

  // 3. Query matching active batches to snapshot into audit items
  const medConditions = [
    eq(schema.medicines.tenantId, tenantId),
    eq(schema.medicines.isActive, true),
  ];

  if (scope === "racks") {
    medConditions.push(inArray(schema.medicines.rackId, rackIds));
  }

  const activeBatches = await tx
    .select({
      batch: schema.batches,
      medicine: schema.medicines,
    })
    .from(schema.batches)
    .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
    .where(
      and(
        eq(schema.batches.tenantId, tenantId),
        eq(schema.batches.storeId, storeId),
        eq(schema.batches.status, "active"),
        ...medConditions
      )
    )
    .orderBy(schema.medicines.name, schema.batches.expiryDate);

  // 4. Create snapshot items
  for (const row of activeBatches) {
    const cost = row.batch.purchaseRate || 0;
    await tx.insert(schema.stockAuditItems).values({
      tenantId,
      sessionId: session.id,
      batchId: row.batch.id,
      medicineId: row.medicine.id,
      rackId: row.medicine.rackId,
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
 * Records physical counted quantities submitted by staff.
 * If in blind count mode, staff does not see system quantity on input.
 * Calculates varianceQty (counted - system) and financial impact.
 */
export async function recordStockAuditCounts(
  tx: Tx,
  params: RecordAuditCountsParams
) {
  const { tenantId, sessionId, counts, userId } = params;

  if (counts.length === 0) {
    throw new DomainError("EMPTY_COUNTS", "No count updates provided");
  }

  const [session] = await tx
    .select()
    .from(schema.stockAuditSessions)
    .where(
      and(
        eq(schema.stockAuditSessions.id, sessionId),
        eq(schema.stockAuditSessions.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!session) {
    throw new DomainError("SESSION_NOT_FOUND", "Stock audit session not found");
  }

  if (session.status === "approved" || session.status === "cancelled") {
    throw new DomainError(
      "SESSION_CLOSED",
      `Cannot record counts on a ${session.status} audit session`
    );
  }

  const now = new Date();

  for (const c of counts) {
    if (c.countedQty < 0) {
      throw new DomainError("INVALID_COUNT", "Counted quantity cannot be negative");
    }

    const [item] = await tx
      .select()
      .from(schema.stockAuditItems)
      .where(
        and(
          eq(schema.stockAuditItems.id, c.itemId),
          eq(schema.stockAuditItems.sessionId, sessionId),
          eq(schema.stockAuditItems.tenantId, tenantId)
        )
      )
      .limit(1);

    if (!item) continue;

    const varianceQty = c.countedQty - item.systemQty;
    const varianceCostPaise = varianceQty * item.unitCostPaise;

    await tx
      .update(schema.stockAuditItems)
      .set({
        countedQty: c.countedQty,
        varianceQty,
        varianceCostPaise,
        status: "counted",
        countedBy: userId,
        countedAt: now,
      })
      .where(eq(schema.stockAuditItems.id, c.itemId));
  }

  // Update session status to under_review
  await tx
    .update(schema.stockAuditSessions)
    .set({
      status: "under_review",
    })
    .where(eq(schema.stockAuditSessions.id, sessionId));

  return { success: true, updatedCount: counts.length };
}

/**
 * Owner sign-off and approval of physical audit discrepancies.
 * 1. Adjusts batch quantities on hand.
 * 2. Writes immutable stock movements (`type: "adjustment"`, `refType: "stock_audit_session"`).
 * 3. Posts balanced double-entry financial voucher for net shortage or excess.
 * 4. Marks session as approved.
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
    throw new DomainError("ALREADY_APPROVED", "This audit session has already been approved and reconciled");
  }

  if (session.status === "cancelled") {
    throw new DomainError("SESSION_CANCELLED", "Cannot approve a cancelled audit session");
  }

  // Fetch all items
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
    const variance = item.varianceQty || 0;
    if (variance === 0) {
      await tx
        .update(schema.stockAuditItems)
        .set({ status: "reconciled" })
        .where(eq(schema.stockAuditItems.id, item.id));
      continue;
    }

    // Lock batch row
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

    if (!batch) continue;

    const newBalance = Math.max(0, batch.qtyOnHand + variance);
    const newStatus = newBalance === 0 ? "hold" : batch.status;

    // Update batch stock
    await tx
      .update(schema.batches)
      .set({
        qtyOnHand: newBalance,
        status: newStatus,
      })
      .where(eq(schema.batches.id, batch.id));

    // Record stock movement
    await tx.insert(schema.stockMovements).values({
      tenantId,
      storeId,
      batchId: batch.id,
      medicineId: item.medicineId,
      type: "adjustment",
      qtyChange: variance,
      balanceAfter: newBalance,
      unitCost: item.unitCostPaise,
      refType: "stock_audit_session",
      refId: session.id,
      note: `Physical audit variance adjustment (${variance > 0 ? `+${variance}` : variance})`,
      userId,
    });

    // Mark line reconciled
    await tx
      .update(schema.stockAuditItems)
      .set({ status: "reconciled" })
      .where(eq(schema.stockAuditItems.id, item.id));

    if (variance < 0) {
      totalShortagePaise += Math.abs(item.varianceCostPaise);
    } else {
      totalExcessPaise += item.varianceCostPaise;
    }

    reconciledAdjustmentsCount++;
  }

  // Financial journal entry for discrepancies
  const netFinancialImpactPaise = totalExcessPaise - totalShortagePaise;
  const accounts = await getOrSeedAccounts(tx, tenantId);
  const now = new Date();
  const todayStr = format(now, "yyyy-MM-dd");

  if (Math.abs(netFinancialImpactPaise) > 0) {
    const entryNo = await nextDocNumber(tx, tenantId, storeId, "journal", "JV");

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
      // Net Excess: Debit Inventory Asset (inventory 1080), Credit Discount/Income (discounts 3020)
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

  // Update session to approved
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

/**
 * Cancels an ongoing audit session.
 */
export async function cancelStockAuditSession(
  tx: Tx,
  params: { tenantId: string; storeId: string; sessionId: string; userId: string }
) {
  const { tenantId, storeId, sessionId, userId } = params;

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
    throw new DomainError("ALREADY_APPROVED", "Cannot cancel an approved audit session");
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
 * Retrieves audit session details and line items.
 * If isBlindStaffView is true, systemQty is masked to prevent counting bias.
 */
export async function getStockAuditSessionDetails(
  dbOrTx: DbOrTx,
  params: { tenantId: string; sessionId: string; isBlindStaffView?: boolean }
) {
  const { tenantId, sessionId, isBlindStaffView = false } = params;

  const [session] = await dbOrTx
    .select({
      session: schema.stockAuditSessions,
      store: schema.stores,
    })
    .from(schema.stockAuditSessions)
    .innerJoin(schema.stores, eq(schema.stockAuditSessions.storeId, schema.stores.id))
    .where(
      and(
        eq(schema.stockAuditSessions.id, sessionId),
        eq(schema.stockAuditSessions.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!session) return null;

  const items = await dbOrTx
    .select({
      item: schema.stockAuditItems,
      batch: schema.batches,
      medicine: schema.medicines,
      rack: schema.racks,
    })
    .from(schema.stockAuditItems)
    .innerJoin(schema.batches, eq(schema.stockAuditItems.batchId, schema.batches.id))
    .innerJoin(schema.medicines, eq(schema.stockAuditItems.medicineId, schema.medicines.id))
    .leftJoin(schema.racks, eq(schema.stockAuditItems.rackId, schema.racks.id))
    .where(
      and(
        eq(schema.stockAuditItems.sessionId, sessionId),
        eq(schema.stockAuditItems.tenantId, tenantId)
      )
    )
    .orderBy(schema.racks.code, schema.medicines.name);

  const formattedItems = items.map((r) => {
    const isCounted = r.item.countedQty !== null;
    return {
      id: r.item.id,
      batchId: r.item.batchId,
      medicineId: r.item.medicineId,
      medicineName: r.medicine.name,
      genericName: r.medicine.genericName,
      packUnit: r.medicine.packUnit || "pack",
      looseUnit: r.medicine.looseUnit || "unit",
      batchNo: r.batch.batchNo,
      expiryDate: r.batch.expiryDate,
      rackCode: r.rack?.code || "Unassigned",
      rackName: r.rack?.name || "General Floor",
      // Hide systemQty if blind count is enabled and user is in staff counting view
      systemQty: isBlindStaffView && session.session.blindCount && !isCounted ? null : r.item.systemQty,
      countedQty: r.item.countedQty,
      varianceQty: r.item.varianceQty,
      unitCostPaise: r.item.unitCostPaise,
      varianceCostPaise: r.item.varianceCostPaise,
      status: r.item.status,
      countedAt: r.item.countedAt,
    };
  });

  const totalLines = formattedItems.length;
  const countedLines = formattedItems.filter((i) => i.countedQty !== null).length;
  const pendingLines = totalLines - countedLines;
  const shortageLines = formattedItems.filter((i) => (i.varianceQty || 0) < 0).length;
  const excessLines = formattedItems.filter((i) => (i.varianceQty || 0) > 0).length;
  const exactLines = formattedItems.filter((i) => i.countedQty !== null && (i.varianceQty || 0) === 0).length;

  const totalShortageCostPaise = formattedItems
    .filter((i) => (i.varianceQty || 0) < 0)
    .reduce((sum, i) => sum + Math.abs(i.varianceCostPaise || 0), 0);

  const totalExcessCostPaise = formattedItems
    .filter((i) => (i.varianceQty || 0) > 0)
    .reduce((sum, i) => sum + (i.varianceCostPaise || 0), 0);

  const netVarianceCostPaise = totalExcessCostPaise - totalShortageCostPaise;

  return {
    session: {
      id: session.session.id,
      sessionNo: session.session.sessionNo,
      storeId: session.session.storeId,
      storeName: session.store.name,
      storeCode: session.store.code,
      scope: session.session.scope,
      rackIds: session.session.rackIds,
      blindCount: session.session.blindCount,
      status: session.session.status,
      notes: session.session.notes,
      startedBy: session.session.startedBy,
      approvedBy: session.session.approvedBy,
      approvedAt: session.session.approvedAt,
      createdAt: session.session.createdAt,
    },
    items: formattedItems,
    summary: {
      totalLines,
      countedLines,
      pendingLines,
      shortageLines,
      excessLines,
      exactLines,
      totalShortageCostPaise,
      totalExcessCostPaise,
      netVarianceCostPaise,
    },
  };
}

/**
 * Lists audit sessions for store.
 */
export async function listStockAuditSessions(
  dbOrTx: DbOrTx,
  params: { tenantId: string; storeId?: string }
) {
  const conditions = [eq(schema.stockAuditSessions.tenantId, params.tenantId)];

  if (params.storeId) {
    conditions.push(eq(schema.stockAuditSessions.storeId, params.storeId));
  }

  const rows = await dbOrTx
    .select({
      session: schema.stockAuditSessions,
      store: schema.stores,
    })
    .from(schema.stockAuditSessions)
    .innerJoin(schema.stores, eq(schema.stockAuditSessions.storeId, schema.stores.id))
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

