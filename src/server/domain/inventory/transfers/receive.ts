import { and, eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { recordStockMovement } from "@/server/domain/stock";
import { ReceiveTransferSchema, type ReceiveTransferInput } from "./types";
import type { UserContext, TransactionExecutor } from "./create";

export async function receiveTransfer(
  ctx: UserContext,
  rawInput: ReceiveTransferInput,
  externalDb?: TransactionExecutor,
) {
  const input = ReceiveTransferSchema.parse(rawInput);
  const targetDb = externalDb ?? db;

  const run = async (tx: Tx) => {
    // 1. Idempotency replay check
    const [existingEvent] = await tx
      .select()
      .from(schema.stockTransferReceiptEvents)
      .where(
        and(
          eq(schema.stockTransferReceiptEvents.tenantId, ctx.tenantId),
          eq(schema.stockTransferReceiptEvents.transferId, input.transferId),
          eq(schema.stockTransferReceiptEvents.idempotencyKey, input.idempotencyKey),
        ),
      );

    if (existingEvent) {
      const [transfer] = await tx
        .select()
        .from(schema.stockTransfers)
        .where(eq(schema.stockTransfers.id, input.transferId));
      return {
        transferId: transfer.id,
        transferNo: transfer.transferNo,
        status: transfer.status,
        idempotentReplay: true,
      };
    }

    // 2. Lock transfer FOR UPDATE
    const [transfer] = await tx
      .select()
      .from(schema.stockTransfers)
      .where(
        and(
          eq(schema.stockTransfers.id, input.transferId),
          eq(schema.stockTransfers.tenantId, ctx.tenantId),
        ),
      )
      .for("update");

    if (!transfer) {
      throw new DomainError("TRANSFER_NOT_FOUND", `Transfer ${input.transferId} not found`);
    }

    if (transfer.status !== "dispatched" && transfer.status !== "partially_received") {
      throw new DomainError(
        "INVALID_STATE",
        `Transfer must be dispatched or partially received to receive stock. Current status: ${transfer.status}`,
      );
    }

    // 3. Authorization guard: destination store check if store-scoped
    if (ctx.storeId && ctx.storeId !== transfer.toStoreId) {
      throw new DomainError(
        "UNAUTHORIZED_STORE",
        `Only users authorized for destination store (${transfer.toStoreId}) can receive this transfer`,
      );
    }

    // 4. Fetch line items
    const items = await tx
      .select()
      .from(schema.stockTransferItems)
      .where(eq(schema.stockTransferItems.transferId, transfer.id));

    const itemMap = new Map(items.map((i) => [i.id, i]));

    for (const line of input.items) {
      const item = itemMap.get(line.itemId);
      if (!item) {
        throw new DomainError("ITEM_NOT_FOUND", `Transfer item ${line.itemId} not found`);
      }

      const previouslyAccounted = item.receivedQty + item.qtyDamaged + item.qtyShortage;
      const remainingUnaccounted = item.qtyDispatched - previouslyAccounted;
      const incomingTotal = line.qtyReceived + (line.qtyDamaged ?? 0) + (line.qtyShortage ?? 0);

      if (incomingTotal > remainingUnaccounted) {
        throw new DomainError(
          "EXCESS_RECEIPT",
          `Total receipt (${incomingTotal}) exceeds remaining unaccounted quantity (${remainingUnaccounted}) for batch ${item.batchNo}`,
        );
      }

      // 5. Destination batch resolution & provenance preservation
      const [existingDestBatch] = await tx
        .select()
        .from(schema.batches)
        .where(
          and(
            eq(schema.batches.tenantId, ctx.tenantId),
            eq(schema.batches.storeId, transfer.toStoreId),
            eq(schema.batches.medicineId, item.medicineId),
            eq(schema.batches.batchNo, item.batchNo),
          ),
        )
        .for("update");

      let destBatchId: string;

      if (existingDestBatch) {
        if (existingDestBatch.expiryDate !== item.expiryDate) {
          throw new DomainError(
            "BATCH_EXPIRY_MISMATCH",
            `Expiry date on existing batch (${existingDestBatch.expiryDate}) does not match transfer batch (${item.expiryDate})`,
          );
        }
        destBatchId = existingDestBatch.id;
      } else {
        const [newBatch] = await tx
          .insert(schema.batches)
          .values({
            tenantId: ctx.tenantId,
            storeId: transfer.toStoreId,
            medicineId: item.medicineId,
            batchNo: item.batchNo,
            expiryDate: item.expiryDate,
            mfgDate: item.mfgDate,
            mrp: item.mrp ?? 0,
            purchaseRate: item.unitCost ?? 0,
            saleRate: item.saleRate ?? item.mrp ?? 0,
            qtyOnHand: 0,
          })
          .returning({ id: schema.batches.id });
        destBatchId = newBatch.id;
      }

      // 6. Record accepted stock movement into destination store
      if (line.qtyReceived > 0) {
        await recordStockMovement({
          tx,
          tenantId: ctx.tenantId,
          storeId: transfer.toStoreId,
          batchId: destBatchId,
          medicineId: item.medicineId,
          type: "transfer_in",
          qtyChange: line.qtyReceived,
          unitCost: item.unitCost ?? undefined,
          refType: "stock_transfer",
          refId: transfer.id,
          note: `Transfer in from source branch. Transfer #${transfer.transferNo}`,
          userId: ctx.userId,
        });
      }

      // 7. Track damaged stock in quarantine
      if (line.qtyDamaged && line.qtyDamaged > 0) {
        await tx.insert(schema.quarantineBatches).values({
          tenantId: ctx.tenantId,
          storeId: transfer.toStoreId,
          batchId: destBatchId,
          medicineId: item.medicineId,
          qty: line.qtyDamaged,
          reason: "damaged",
          status: "quarantined",
          notes: `Transit damage from Transfer #${transfer.transferNo}${line.discrepancyReason ? ` (${line.discrepancyReason})` : ""}`,
          quarantinedBy: ctx.userId,
        });
      }

      // 8. Update line item cumulative quantities
      await tx
        .update(schema.stockTransferItems)
        .set({
          receivedQty: item.receivedQty + line.qtyReceived,
          qtyDamaged: item.qtyDamaged + (line.qtyDamaged ?? 0),
          qtyShortage: item.qtyShortage + (line.qtyShortage ?? 0),
          toBatchId: destBatchId,
          discrepancyReason: line.discrepancyReason ?? item.discrepancyReason,
          updatedAt: new Date(),
        })
        .where(eq(schema.stockTransferItems.id, item.id));
    }

    // 9. Record idempotent receipt event
    await tx.insert(schema.stockTransferReceiptEvents).values({
      tenantId: ctx.tenantId,
      transferId: transfer.id,
      idempotencyKey: input.idempotencyKey,
      receivedBy: ctx.userId,
      notes: input.notes ?? null,
    });

    // 10. Re-read all items to determine final transfer status
    const updatedItems = await tx
      .select()
      .from(schema.stockTransferItems)
      .where(eq(schema.stockTransferItems.transferId, transfer.id));

    const isFullyAccounted = updatedItems.every(
      (i) => i.receivedQty + i.qtyDamaged + i.qtyShortage >= i.qtyDispatched,
    );

    const newStatus = isFullyAccounted ? "received" : "partially_received";
    const now = new Date();

    await tx
      .update(schema.stockTransfers)
      .set({
        status: newStatus,
        receivedBy: ctx.userId,
        receivedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.stockTransfers.id, transfer.id));

    // 11. Audit log
    await writeAudit(
      tx,
      { tenantId: ctx.tenantId, storeId: transfer.toStoreId, userId: ctx.userId },
      {
        action: "update",
        entityType: "stock_transfer",
        entityId: transfer.id,
        newValue: { status: newStatus, idempotencyKey: input.idempotencyKey },
      },
    );

    return {
      transferId: transfer.id,
      transferNo: transfer.transferNo,
      status: newStatus,
      idempotentReplay: false,
    };
  };

  return targetDb.transaction(run);
}
