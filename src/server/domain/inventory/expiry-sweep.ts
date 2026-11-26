import { and, eq, gt, lt } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { schema } from "@/server/db";
import { recordStockMovement } from "@/server/domain/stock";

/**
 * Bulk "Expired Before" sweep (A10.8 / B6):
 * Moves all active batches with `expiryDate < cutoffDate` and `qtyOnHand > 0`
 * into `expired` / `quarantined` status via stock movements.
 */
export async function sweepExpiredBatchesToQuarantine(params: {
  tx: Tx;
  tenantId: string;
  storeId: string;
  cutoffDate: string; // YYYY-MM-DD
  userId: string;
}): Promise<{ sweptCount: number; totalUnitsSwept: number; totalCostPaise: number }> {
  const candidates = await params.tx
    .select()
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.tenantId, params.tenantId),
        eq(schema.batches.storeId, params.storeId),
        eq(schema.batches.status, "active"),
        lt(schema.batches.expiryDate, params.cutoffDate),
        gt(schema.batches.qtyOnHand, 0),
      ),
    )
    .for("update");

  let sweptCount = 0;
  let totalUnitsSwept = 0;
  let totalCostPaise = 0;

  for (const batch of candidates) {
    const qty = batch.qtyOnHand;
    await recordStockMovement({
      tx: params.tx,
      tenantId: params.tenantId,
      storeId: params.storeId,
      batchId: batch.id,
      medicineId: batch.medicineId,
      type: "expired",
      qtyChange: -qty,
      unitCost: batch.purchaseRate ?? 0,
      refType: "expiry_sweep",
      note: `Bulk expired-before ${params.cutoffDate} sweep`,
      userId: params.userId,
    });

    await params.tx
      .update(schema.batches)
      .set({ status: "quarantined" })
      .where(eq(schema.batches.id, batch.id));

    sweptCount++;
    totalUnitsSwept += qty;
    totalCostPaise += qty * (batch.purchaseRate ?? 0);
  }

  return { sweptCount, totalUnitsSwept, totalCostPaise };
}
