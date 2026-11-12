import { and, eq, inArray } from "drizzle-orm";
import { db, schema, type Tx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { nextDocNumber } from "@/server/domain/sequence";
import { determineStatutoryRouting } from "./statutory";
import {
  CreateTransferSchema,
  CancelTransferSchema,
  type CreateTransferInput,
  type CancelTransferInput,
} from "./types";

export interface UserContext {
  tenantId: string;
  storeId?: string;
  userId: string;
}

export type TransactionExecutor = {
  transaction: <T>(cb: (tx: Tx) => Promise<T>) => Promise<T>;
};

export async function createDraftTransfer(
  ctx: UserContext,
  rawInput: CreateTransferInput,
  externalDb?: TransactionExecutor,
) {
  const input = CreateTransferSchema.parse(rawInput);
  const targetDb = externalDb ?? db;

  const run = async (tx: Tx) => {
    // 1. Verify source and destination stores
    const [fromStore] = await tx
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        address: schema.stores.address,
        gstin: schema.stores.gstin,
        stateCode: schema.stores.stateCode,
      })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, input.fromStoreId), eq(schema.stores.tenantId, ctx.tenantId)));

    const [toStore] = await tx
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        address: schema.stores.address,
        gstin: schema.stores.gstin,
        stateCode: schema.stores.stateCode,
      })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, input.toStoreId), eq(schema.stores.tenantId, ctx.tenantId)));

    if (!fromStore) {
      throw new DomainError("STORE_NOT_FOUND", `Source store not found: ${input.fromStoreId}`);
    }
    if (!toStore) {
      throw new DomainError("STORE_NOT_FOUND", `Destination store not found: ${input.toStoreId}`);
    }

    // 2. Fetch and validate batch snapshots
    const batchIds = input.items.map((i) => i.fromBatchId);
    const sourceBatches = await tx
      .select({
        id: schema.batches.id,
        medicineId: schema.batches.medicineId,
        batchNo: schema.batches.batchNo,
        expiryDate: schema.batches.expiryDate,
        mfgDate: schema.batches.mfgDate,
        mrp: schema.batches.mrp,
        purchaseRate: schema.batches.purchaseRate,
        saleRate: schema.batches.saleRate,
        qtyOnHand: schema.batches.qtyOnHand,
        hsn: schema.medicines.hsn,
        gstRateBp: schema.medicines.gstRateBp,
      })
      .from(schema.batches)
      .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
      .where(
        and(
          eq(schema.batches.tenantId, ctx.tenantId),
          eq(schema.batches.storeId, input.fromStoreId),
          inArray(schema.batches.id, batchIds),
        ),
      );

    const batchMap = new Map(sourceBatches.map((b) => [b.id, b]));

    for (const item of input.items) {
      const b = batchMap.get(item.fromBatchId);
      if (!b) {
        throw new DomainError("BATCH_NOT_FOUND", `Batch ${item.fromBatchId} not found in source store`);
      }
      if (b.medicineId !== item.medicineId) {
        throw new DomainError("INVALID_ITEM", `Batch ${item.fromBatchId} does not match medicine ${item.medicineId}`);
      }
    }

    // Compute statutory lines and financial routing for the draft
    const statutoryLines = input.items.map((item) => {
      const b = batchMap.get(item.fromBatchId)!;
      return {
        qty: item.qty,
        unitCost: b.purchaseRate ?? 0,
        gstRateBp: b.gstRateBp ?? 0,
      };
    });

    const routing = determineStatutoryRouting(fromStore, toStore, statutoryLines);

    // 3. Sequential transfer number
    const transferNo = await nextDocNumber(tx, ctx.tenantId, input.fromStoreId, "transfer", "TRF");

    // 4. Insert transfer header with calculated valuation
    const [transfer] = await tx
      .insert(schema.stockTransfers)
      .values({
        tenantId: ctx.tenantId,
        transferNo,
        fromStoreId: input.fromStoreId,
        toStoreId: input.toStoreId,
        status: "draft",
        docKind: routing.docKind,
        notes: input.notes ?? null,
        taxableValuePaise: routing.taxableValuePaise,
        cgstPaise: routing.cgstPaise,
        sgstPaise: routing.sgstPaise,
        igstPaise: routing.igstPaise,
        totalValuePaise: routing.totalValuePaise,
        placeOfSupply: routing.placeOfSupply,
        createdBy: ctx.userId,
      })
      .returning();

    // 5. Insert transfer items
    for (const item of input.items) {
      const b = batchMap.get(item.fromBatchId)!;
      await tx.insert(schema.stockTransferItems).values({
        tenantId: ctx.tenantId,
        transferId: transfer.id,
        medicineId: item.medicineId,
        fromBatchId: item.fromBatchId,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        mfgDate: b.mfgDate,
        hsn: b.hsn,
        qty: item.qty,
        qtyDispatched: item.qty, // default requested is dispatched
        receivedQty: 0,
        qtyDamaged: 0,
        qtyShortage: 0,
        unitCost: b.purchaseRate,
        mrp: b.mrp,
        saleRate: b.saleRate ?? b.mrp,
        gstRateBp: b.gstRateBp ?? 0,
      });
    }

    // 6. Audit log
    await writeAudit(tx, { tenantId: ctx.tenantId, storeId: input.fromStoreId, userId: ctx.userId }, {
      action: "create",
      entityType: "stock_transfer",
      entityId: transfer.id,
      newValue: { transferNo, fromStoreId: input.fromStoreId, toStoreId: input.toStoreId, itemCount: input.items.length },
    });

    return { transferId: transfer.id, transferNo };
  };

  return targetDb.transaction(run);
}

export async function cancelTransfer(
  ctx: UserContext,
  rawInput: CancelTransferInput,
  externalDb?: TransactionExecutor,
) {
  const input = CancelTransferSchema.parse(rawInput);
  const targetDb = externalDb ?? db;

  const run = async (tx: Tx) => {
    const [transfer] = await tx
      .select()
      .from(schema.stockTransfers)
      .where(and(eq(schema.stockTransfers.id, input.transferId), eq(schema.stockTransfers.tenantId, ctx.tenantId)))
      .for("update");

    if (!transfer) {
      throw new DomainError("TRANSFER_NOT_FOUND", `Transfer ${input.transferId} not found`);
    }

    if (transfer.status !== "draft") {
      throw new DomainError("INVALID_STATE", `Only draft transfers can be cancelled. Current status: ${transfer.status}`);
    }

    await tx
      .update(schema.stockTransfers)
      .set({
        status: "cancelled",
        cancelledBy: ctx.userId,
        cancelledAt: new Date(),
        cancelReason: input.reason,
        updatedAt: new Date(),
      })
      .where(eq(schema.stockTransfers.id, transfer.id));

    await writeAudit(tx, { tenantId: ctx.tenantId, storeId: transfer.fromStoreId, userId: ctx.userId }, {
      action: "cancel",
      entityType: "stock_transfer",
      entityId: transfer.id,
      reason: input.reason,
    });

    return { transferId: transfer.id, status: "cancelled" };
  };

  return targetDb.transaction(run);
}
