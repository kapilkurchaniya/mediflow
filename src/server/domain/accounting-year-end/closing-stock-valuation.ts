import { db, schema, type DbOrTx } from "@/server/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { DomainError } from "@/server/errors";
import { calculate6TierNrv } from "./closing-stock-nrv";
import type { HistoricalProvenanceCheck } from "./types";

export function calculateCutoffDate(fiscalYear: string): Date {
  const parts = fiscalYear.split("-");
  const endYear = parts[1]?.trim() ?? "2025";
  return new Date(`${endYear}-03-31T23:59:59.999+05:30`);
}

/** Preflight validation ensuring every batch has valid inception and positive reconstructed balance. */
export async function validateHistoricalStockBaseline(
  tenantId: string, storeId: string, cutoffDate: Date, dbOrTx: DbOrTx = db,
): Promise<HistoricalProvenanceCheck> {
  const allBatches = await dbOrTx.select().from(schema.batches)
    .where(and(eq(schema.batches.tenantId, tenantId), eq(schema.batches.storeId, storeId)));

  const movements = await dbOrTx
    .select({ batchId: schema.stockMovements.batchId, type: schema.stockMovements.type, qtyChange: schema.stockMovements.qtyChange })
    .from(schema.stockMovements)
    .where(and(eq(schema.stockMovements.tenantId, tenantId), eq(schema.stockMovements.storeId, storeId), lte(schema.stockMovements.effectiveAt, cutoffDate)));

  const batchMap = new Map<string, { qty: number; hasInception: boolean }>();
  for (const m of movements) {
    const curr = batchMap.get(m.batchId) ?? { qty: 0, hasInception: false };
    curr.qty += m.qtyChange;
    if (m.type === "opening" || m.type === "purchase") curr.hasInception = true;
    batchMap.set(m.batchId, curr);
  }

  const anomalousBatches: Array<{ batchId: string; batchNumber: string; discrepancyReason: string }> = [];
  for (const b of allBatches) {
    const stats = batchMap.get(b.id);
    if (!stats) continue;
    if (stats.qty < 0) {
      anomalousBatches.push({ batchId: b.id, batchNumber: b.batchNo, discrepancyReason: `Negative reconstructed quantity: ${stats.qty}` });
    } else if (stats.qty > 0 && !stats.hasInception) {
      anomalousBatches.push({ batchId: b.id, batchNumber: b.batchNo, discrepancyReason: "Missing opening or purchase inception movement prior to cutoff" });
    }
  }

  return { valid: anomalousBatches.length === 0, anomalousBatches };
}

/** Generates or recalculates draft year-end closing stock snapshot and line items. */
export async function generateDraftYearEndSnapshot(
  tenantId: string,
  storeId: string,
  fiscalYear: string,
  dbOrTx: DbOrTx = db,
) {
  const cutoffDate = calculateCutoffDate(fiscalYear);

  // 1. Preflight provenance check
  const provenance = await validateHistoricalStockBaseline(tenantId, storeId, cutoffDate, dbOrTx);
  if (!provenance.valid) {
    throw new DomainError(
      "HISTORICAL_PROVENANCE_FAILED",
      `Historical stock ledger has ${provenance.anomalousBatches.length} anomalous batches without valid provenance.`,
    );
  }

  return await dbOrTx.transaction(async (tx) => {
    // 2. Ensure period control row exists in state 'open'
    await tx
      .insert(schema.yearEndPeriodControls)
      .values({
        tenantId,
        storeId,
        fiscalYear,
        cutoffDate,
        status: "open",
      })
      .onConflictDoNothing();

    // 3. Reconstruct batch balances as of cutoff
    const batchMovements = await tx
      .select({
        batchId: schema.stockMovements.batchId,
        qty: sql<number>`coalesce(sum(${schema.stockMovements.qtyChange}), 0)::int`,
      })
      .from(schema.stockMovements)
      .where(
        and(
          eq(schema.stockMovements.tenantId, tenantId),
          eq(schema.stockMovements.storeId, storeId),
          lte(schema.stockMovements.effectiveAt, cutoffDate),
        ),
      )
      .groupBy(schema.stockMovements.batchId);

    const positiveBatches = batchMovements.filter((bm) => bm.qty > 0);
    const existingSnap = await tx.query.yearEndStockSnapshots.findFirst({
      where: and(
        eq(schema.yearEndStockSnapshots.tenantId, tenantId),
        eq(schema.yearEndStockSnapshots.storeId, storeId),
        eq(schema.yearEndStockSnapshots.fiscalYear, fiscalYear),
      ),
    });

    if (existingSnap && existingSnap.status === "finalized") {
      throw new DomainError("SNAPSHOT_ALREADY_FINALIZED", `Year-end snapshot for FY ${fiscalYear} is already finalized.`);
    }

    let snapshotId = existingSnap?.id;
    if (!snapshotId) {
      const [inserted] = await tx
        .insert(schema.yearEndStockSnapshots)
        .values({
          tenantId,
          storeId,
          fiscalYear,
          cutoffDate,
          status: "draft",
        })
        .returning();
      snapshotId = inserted.id;
    } else {
      // Clear draft line items to repopulate
      await tx
        .delete(schema.yearEndStockItems)
        .where(
          and(
            eq(schema.yearEndStockItems.tenantId, tenantId),
            eq(schema.yearEndStockItems.storeId, storeId),
            eq(schema.yearEndStockItems.snapshotId, snapshotId),
          ),
        );
    }

    let totalUnits = 0;
    let grossCostPaise = 0;
    let totalNrvPaise = 0;
    let finalValuationPaise = 0;
    let totalProvisionPaise = 0;

    for (const bm of positiveBatches) {
      const batch = await tx.query.batches.findFirst({
        where: and(eq(schema.batches.tenantId, tenantId), eq(schema.batches.storeId, storeId), eq(schema.batches.id, bm.batchId)),
      });
      if (!batch) continue;

      const landedCostPaise = batch.purchaseRate ?? 0;
      const catalogSaleRate = batch.mrp ?? landedCostPaise;
      const nrvEval = calculate6TierNrv(
        {
          expiryDate: batch.expiryDate,
          landedCostPaise,
          catalogSaleRatePaise: catalogSaleRate,
        },
        cutoffDate,
      );

      const costValue = bm.qty * landedCostPaise;
      const effectiveNrvUnit = nrvEval.estimatedNrvPaise;
      const valuationUnit = Math.min(landedCostPaise, effectiveNrvUnit);
      const lineValuation = bm.qty * valuationUnit;
      const lineProvision = Math.max(0, costValue - lineValuation);

      totalUnits += bm.qty;
      grossCostPaise += costValue;
      totalNrvPaise += bm.qty * effectiveNrvUnit;
      finalValuationPaise += lineValuation;
      totalProvisionPaise += lineProvision;

      await tx.insert(schema.yearEndStockItems).values({
        tenantId,
        storeId,
        snapshotId,
        batchId: batch.id,
        batchNumber: batch.batchNo,
        expiryDate: batch.expiryDate,
        qty: bm.qty,
        landedCostPaise,
        costValuePaise: costValue,
        estimatedNrvPaise: effectiveNrvUnit,
        nrvPaise: effectiveNrvUnit,
        nrvBasis: nrvEval.nrvBasis,
        nrvSource: nrvEval.nrvSource,
        classification: nrvEval.classification,
        finalValuationPaise: lineValuation,
        provisionPaise: lineProvision,
      });
    }

    await tx
      .update(schema.yearEndStockSnapshots)
      .set({
        totalUnits,
        grossLandedCostPaise: grossCostPaise,
        totalNrvPaise,
        finalValuationPaise,
        totalProvisionPaise,
      })
      .where(eq(schema.yearEndStockSnapshots.id, snapshotId));

    return { snapshotId, totalUnits, finalValuationPaise, totalProvisionPaise };
  });
}

/** Overrides NRV for a single line item with auditor evidence and recalculates totals. */
export async function overrideItemNrv(
  tenantId: string,
  storeId: string,
  itemId: string,
  overrideNrvPaise: number,
  reason: string,
  reviewerUserId: string,
  dbOrTx: DbOrTx = db,
) {
  return await dbOrTx.transaction(async (tx) => {
    const item = await tx.query.yearEndStockItems.findFirst({
      where: and(
        eq(schema.yearEndStockItems.tenantId, tenantId),
        eq(schema.yearEndStockItems.storeId, storeId),
        eq(schema.yearEndStockItems.id, itemId),
      ),
    });
    if (!item) throw new DomainError("ITEM_NOT_FOUND", "Line item not found");

    const snap = await tx.query.yearEndStockSnapshots.findFirst({
      where: and(
        eq(schema.yearEndStockSnapshots.tenantId, tenantId),
        eq(schema.yearEndStockSnapshots.storeId, storeId),
        eq(schema.yearEndStockSnapshots.id, item.snapshotId),
      ),
    });
    if (!snap || snap.status === "finalized") {
      throw new DomainError("SNAPSHOT_FINALIZED", "Cannot modify items in a finalized snapshot");
    }

    const valuationUnit = Math.min(item.landedCostPaise, overrideNrvPaise);
    const finalValuation = item.qty * valuationUnit;
    const provision = Math.max(0, item.costValuePaise - finalValuation);

    await tx
      .update(schema.yearEndStockItems)
      .set({
        nrvPaise: overrideNrvPaise,
        isOverridden: true,
        overrideReason: reason,
        reviewedBy: reviewerUserId,
        reviewedAt: new Date(),
        finalValuationPaise: finalValuation,
        provisionPaise: provision,
      })
      .where(eq(schema.yearEndStockItems.id, itemId));

    // Recompute header totals
    const sums = await tx
      .select({
        totalUnits: sql<number>`coalesce(sum(${schema.yearEndStockItems.qty}), 0)::bigint`,
        grossCost: sql<number>`coalesce(sum(${schema.yearEndStockItems.costValuePaise}), 0)::bigint`,
        totalNrv: sql<number>`coalesce(sum(${schema.yearEndStockItems.qty}::numeric * ${schema.yearEndStockItems.nrvPaise}::numeric), 0)::bigint`,
        finalVal: sql<number>`coalesce(sum(${schema.yearEndStockItems.finalValuationPaise}), 0)::bigint`,
        totalProv: sql<number>`coalesce(sum(${schema.yearEndStockItems.provisionPaise}), 0)::bigint`,
      })
      .from(schema.yearEndStockItems)
      .where(eq(schema.yearEndStockItems.snapshotId, snap.id));

    const s = sums[0];
    await tx
      .update(schema.yearEndStockSnapshots)
      .set({
        totalUnits: s.totalUnits,
        grossLandedCostPaise: s.grossCost,
        totalNrvPaise: s.totalNrv,
        finalValuationPaise: s.finalVal,
        totalProvisionPaise: s.totalProv,
      })
      .where(eq(schema.yearEndStockSnapshots.id, snap.id));

    return { itemId, finalValuation, provision };
  });
}

/** Invokes the database security definer procedure finalize_year_end_snapshot with single-use raw token. */
export async function finalizeYearEndSnapshotWithToken(
  tenantId: string,
  storeId: string,
  fiscalYear: string,
  rawToken: string,
  dbOrTx: DbOrTx = db,
): Promise<string> {
  const result = await dbOrTx.execute(
    sql`SELECT finalize_year_end_snapshot(${tenantId}::uuid, ${storeId}::uuid, ${fiscalYear}, ${rawToken}) AS snap_id`,
  );
  const snapId = (result.rows[0] as { snap_id: string })?.snap_id;
  return snapId;
}
