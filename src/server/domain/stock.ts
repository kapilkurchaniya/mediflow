import { db, schema } from "@/server/db";
import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";

export type StockMovementType =
  | "opening"
  | "purchase"
  | "sale"
  | "sale_return"
  | "purchase_return"
  | "adjustment"
  | "damage"
  | "expired"
  | "transfer_in"
  | "transfer_out";

interface RecordStockParams {
  tx: Tx;
  tenantId: string;
  storeId: string;
  batchId: string;
  medicineId: string;
  type: StockMovementType;
  qtyChange: number;
  unitCost?: number | null;
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
  userId: string;
}

/**
 * Core domain function to record any change in stock.
 * This MUST be called inside a database transaction (`tx`).
 * It enforces row-level locking on the batch to prevent race conditions.
 */
export async function recordStockMovement(params: RecordStockParams) {
  const {
    tx,
    tenantId,
    storeId,
    batchId,
    medicineId,
    type,
    qtyChange,
    unitCost,
    refType,
    refId,
    note,
    userId,
  } = params;

  if (qtyChange === 0) {
    throw new Error("Quantity change cannot be zero");
  }

  // 1. Lock the batch row for update to prevent concurrent stock modifications
  const [lockedBatch] = await tx
    .select({ id: schema.batches.id, qtyOnHand: schema.batches.qtyOnHand })
    .from(schema.batches)
    .where(eq(schema.batches.id, batchId))
    .for("update");

  if (!lockedBatch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  const balanceAfter = lockedBatch.qtyOnHand + qtyChange;

  if (balanceAfter < 0) {
    throw new Error(`Insufficient stock for batch ${batchId}. Current: ${lockedBatch.qtyOnHand}, Requested change: ${qtyChange}`);
  }

  // 2. Insert the immutable stock movement record
  await tx.insert(schema.stockMovements).values({
    tenantId,
    storeId,
    batchId,
    medicineId,
    type,
    qtyChange,
    balanceAfter,
    unitCost: unitCost ?? undefined,
    refType: refType ?? null,
    refId: refId ?? null,
    note: note ?? null,
    userId,
  });

  // 3. Update the aggregated quantity on the batch
  await tx
    .update(schema.batches)
    .set({ qtyOnHand: balanceAfter })
    .where(eq(schema.batches.id, batchId));

  return balanceAfter;
}
