import { schema } from "@/server/db";
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { AsyncLocalStorage } from "node:async_hooks";

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

export type StockMovementPolicy =
  | { mode: "strict" }
  | { mode: "offline_reconciliation"; deviceId: string; clientSaleId: string };

export const stockMovementPolicyStorage = new AsyncLocalStorage<StockMovementPolicy>();

/**
 * Runs an asynchronous function within an ambient stock movement policy context.
 * Used during offline sales reconciliation so that stock can go negative and trigger
 * deduplicated conflict notifications without altering normal POS paths.
 */
export function runWithStockMovementPolicy<T>(
  policy: StockMovementPolicy,
  fn: () => Promise<T>,
): Promise<T> {
  return stockMovementPolicyStorage.run(policy, fn);
}

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
  policy?: StockMovementPolicy;
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

  const activePolicy =
    params.policy ??
    stockMovementPolicyStorage.getStore() ??
    ({ mode: "strict" } as const);

  // 1. Lock the batch row for update to prevent concurrent stock modifications
  const [lockedBatch] = await tx
    .select({ id: schema.batches.id, qtyOnHand: schema.batches.qtyOnHand })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.id, batchId),
        eq(schema.batches.tenantId, tenantId),
        eq(schema.batches.storeId, storeId),
      ),
    )
    .for("update");

  if (!lockedBatch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  const balanceAfter = lockedBatch.qtyOnHand + qtyChange;

  if (balanceAfter < 0) {
    if (activePolicy.mode === "offline_reconciliation") {
      const dedupeKey = `stock_conflict:${storeId}:${batchId}`;
      const conflictBody = `Batch balance dropped to ${balanceAfter} after offline reconciliation for sale ${activePolicy.clientSaleId} on device ${activePolicy.deviceId}.`;

      const [existingNotif] = await tx
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(
          and(
            eq(schema.notifications.tenantId, tenantId),
            eq(schema.notifications.dedupeKey, dedupeKey),
          ),
        )
        .limit(1);

      if (existingNotif) {
        await tx
          .update(schema.notifications)
          .set({
            body: conflictBody,
            severity: "warning",
          })
          .where(eq(schema.notifications.id, existingNotif.id));
      } else {
        await tx.insert(schema.notifications).values({
          tenantId,
          storeId,
          type: "stock_conflict",
          severity: "warning",
          title: "Negative Stock from Offline Sale",
          body: conflictBody,
          dedupeKey,
        });
      }
    } else {
      throw new Error(
        `Insufficient stock for batch ${batchId}. Current: ${lockedBatch.qtyOnHand}, Requested change: ${qtyChange}`,
      );
    }
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
