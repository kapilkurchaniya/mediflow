import { schema } from "@/server/db";
import { eq, and, sql, notInArray } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/server/db";
import { assertAccountingPeriodOpen } from "../accounting-periods";
import { getOrSeedAccounts } from "../accounting";
import { nextDocNumber } from "../sequence";
import { writeAudit } from "@/server/audit";
import { validateAndLockYearEndSource } from "../accounting-year-end";
import { computeCanonicalPayloadHash } from "./types";
import type { InventorySnapshotResult } from "./types";

interface CaptureSnapshotParams {
  tenantId: string;
  storeId: string;
  asOfDate: string;
  userId?: string;
  sourceYearEndSnapshotId?: string;
}

interface PostSnapshotJournalParams {
  tenantId: string;
  snapshotId: string;
  userId: string;
}

/**
 * Captures an immutable snapshot of opening stock movements for a store and cutover date.
 * Once captured, snapshot membership is fixed in opening_inventory_items.
 */
export async function captureOpeningInventorySnapshot(
  dbOrTx: DbOrTx,
  params: CaptureSnapshotParams
): Promise<InventorySnapshotResult> {
  return await dbOrTx.transaction(async (tx) => {
    const { tenantId, storeId, asOfDate, userId } = params;

  // 1. Check if snapshot already exists for this store and date
  const [existing] = await tx
    .select()
    .from(schema.openingInventorySnapshots)
    .where(
      and(
        eq(schema.openingInventorySnapshots.tenantId, tenantId),
        eq(schema.openingInventorySnapshots.storeId, storeId),
        eq(schema.openingInventorySnapshots.asOfDate, asOfDate)
      )
    );

  if (existing) {
    const [itemsCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.openingInventoryItems)
      .where(eq(schema.openingInventoryItems.snapshotId, existing.id));

    return {
      snapshotId: existing.id,
      journalEntryId: existing.journalEntryId || "",
      itemsCount: itemsCount?.count || 0,
      totalValuePaise: existing.totalValuePaise,
      alreadyPosted: existing.status === "posted",
    };
  }

  // 2. Query opening stock movements for this store not already claimed by another snapshot
  const claimedMovements = tx
    .select({ id: schema.openingInventoryItems.stockMovementId })
    .from(schema.openingInventoryItems);

  const eligibleMovements = await tx
    .select({
      id: schema.stockMovements.id,
      batchId: schema.stockMovements.batchId,
      qtyChange: schema.stockMovements.qtyChange,
      unitCost: schema.stockMovements.unitCost,
    })
    .from(schema.stockMovements)
    .where(
      and(
        eq(schema.stockMovements.tenantId, tenantId),
        eq(schema.stockMovements.storeId, storeId),
        eq(schema.stockMovements.type, "opening"),
        notInArray(schema.stockMovements.id, claimedMovements)
      )
    );

  // 3. Compute total value in integer paise
  let totalPaise = 0;
  for (const m of eligibleMovements) {
    if (m.qtyChange > 0) {
      totalPaise += Math.round(m.qtyChange * (m.unitCost || 0));
    }
  }

  if (params.sourceYearEndSnapshotId) {
    await validateAndLockYearEndSource(tx, {
      tenantId, storeId, asOfDate, totalPaise, sourceYearEndSnapshotId: params.sourceYearEndSnapshotId,
    });
  }

  // 4. Create snapshot header
  const [snapshot] = await tx
    .insert(schema.openingInventorySnapshots)
    .values({
      tenantId,
      storeId,
      asOfDate,
      totalValuePaise: totalPaise,
      sourceYearEndSnapshotId: params.sourceYearEndSnapshotId || null,
      status: "captured",
      createdBy: userId || null,
    })
    .returning();

  // 5. Insert immutable snapshot items
  if (eligibleMovements.length > 0) {
    const itemValues = eligibleMovements
      .filter((m) => m.qtyChange > 0)
      .map((m) => {
        const lineTotal = Math.round(m.qtyChange * (m.unitCost || 0));
        return {
          tenantId,
          snapshotId: snapshot.id,
          stockMovementId: m.id,
          batchId: m.batchId,
          storeId,
          qty: m.qtyChange,
          unitCostPaise: m.unitCost || 0,
          lineTotalPaise: lineTotal,
        };
      });

    if (itemValues.length > 0) {
      await tx.insert(schema.openingInventoryItems).values(itemValues);
    }
  }

    return {
      snapshotId: snapshot.id,
      journalEntryId: "",
      itemsCount: eligibleMovements.length,
      totalValuePaise: totalPaise,
      alreadyPosted: false,
      status: "captured",
    };
  });
}

/**
 * Posts the double-entry accounting journal for a captured inventory snapshot.
 * Dr Account 1080 (Stock in Hand) / Cr Account 3999 (Opening Balance Equity).
 */
export async function postInventorySnapshotJournal(
  dbOrTx: DbOrTx,
  params: PostSnapshotJournalParams
): Promise<InventorySnapshotResult> {
  return await dbOrTx.transaction(async (tx) => {
    const { tenantId, snapshotId, userId } = params;

  // 1. Lock snapshot row FOR UPDATE
  const [snapshot] = await tx
    .select()
    .from(schema.openingInventorySnapshots)
    .where(
      and(
        eq(schema.openingInventorySnapshots.tenantId, tenantId),
        eq(schema.openingInventorySnapshots.id, snapshotId)
      )
    )
    .for("update");

  if (!snapshot) {
    throw new Error(`Inventory snapshot ${snapshotId} not found`);
  }

  if (snapshot.status === "posted" && snapshot.journalEntryId) {
    const [count] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.openingInventoryItems)
      .where(eq(schema.openingInventoryItems.snapshotId, snapshot.id));

    return {
      snapshotId: snapshot.id,
      journalEntryId: snapshot.journalEntryId,
      itemsCount: count?.count || 0,
      totalValuePaise: snapshot.totalValuePaise,
      alreadyPosted: true,
    };
  }

  // 2. Validate period lock (A5.4 master-first row locking)
  await assertAccountingPeriodOpen(tx, {
    tenantId,
    entryDate: snapshot.asOfDate,
    storeId: snapshot.storeId,
  });

  const accounts = await getOrSeedAccounts(tx, tenantId);
  if (!accounts.inventory || !accounts.opening_balance_equity) {
    throw new Error("System accounts 1080 (inventory) and 3999 (opening_balance_equity) are required");
  }

  // 3. Get exact line items sum
  const [valSum] = await tx
    .select({
      total: sql<number>`coalesce(sum(line_total_paise), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.openingInventoryItems)
    .where(eq(schema.openingInventoryItems.snapshotId, snapshot.id));

  const totalPaise = Number(valSum?.total || snapshot.totalValuePaise);
  if (totalPaise <= 0) {
    throw new Error("Cannot post inventory opening journal with zero or negative valuation");
  }

  // 4. Create authoritative double-entry journal
  const entryNo = await nextDocNumber(tx as Tx, tenantId, snapshot.storeId, "journal", "JV");
  const [journal] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId: snapshot.storeId,
      entryNo,
      entryDate: snapshot.asOfDate,
      narration: `Opening inventory valuation cutover as of ${snapshot.asOfDate}`,
      refType: "opening_snapshot",
      refId: snapshot.id,
      createdBy: userId,
    })
    .returning({ id: schema.journalEntries.id });

  // Two balanced lines: Dr 1080 / Cr 3999
  await tx.insert(schema.journalLines).values([
    {
      tenantId,
      entryId: journal.id,
      accountId: accounts.inventory,
      debit: totalPaise,
      credit: 0,
    },
    {
      tenantId,
      entryId: journal.id,
      accountId: accounts.opening_balance_equity,
      debit: 0,
      credit: totalPaise,
    },
  ]);

  // 5. Update snapshot status & create opening balance record
  await tx
    .update(schema.openingInventorySnapshots)
    .set({
      status: "posted",
      journalEntryId: journal.id,
      totalValuePaise: totalPaise,
    })
    .where(eq(schema.openingInventorySnapshots.id, snapshot.id));

  const payloadHash = computeCanonicalPayloadHash({
    tenantId,
    storeId: snapshot.storeId,
    entityType: "inventory_snapshot",
    entityId: snapshot.id,
    asOfDate: snapshot.asOfDate,
    amountPaise: totalPaise,
  });

  await tx.insert(schema.openingBalanceRecords).values({
    tenantId,
    storeId: snapshot.storeId,
    entityType: "inventory_snapshot",
    entityId: snapshot.id,
    asOfDate: snapshot.asOfDate,
    amountPaise: totalPaise,
    journalEntryId: journal.id,
    payloadHash,
    status: "posted",
    createdBy: userId,
  });

  await writeAudit(tx, { tenantId, userId, storeId: snapshot.storeId }, {
    action: "stock_adjust",
    entityType: "opening_inventory_snapshot",
    entityId: snapshot.id,
    newValue: { journalEntryId: journal.id, totalValuePaise: totalPaise },
    reason: `Posted opening inventory valuation cutover as of ${snapshot.asOfDate}`,
  });

    return {
      snapshotId: snapshot.id,
      journalEntryId: journal.id,
      itemsCount: valSum?.count || 0,
      totalValuePaise: totalPaise,
      alreadyPosted: false,
      status: "posted",
    };
  });
}
