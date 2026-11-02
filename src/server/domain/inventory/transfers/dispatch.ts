import { and, eq } from "drizzle-orm";
import { db, schema, type Tx } from "@/server/db";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { nextDocNumber } from "@/server/domain/sequence";
import { recordStockMovement } from "@/server/domain/stock";
import { determineStatutoryRouting } from "./statutory";
import { DispatchTransferSchema, type DispatchTransferInput } from "./types";
import type { UserContext, TransactionExecutor } from "./create";

export async function dispatchTransfer(
  ctx: UserContext,
  rawInput: DispatchTransferInput,
  externalDb?: TransactionExecutor,
) {
  const input = DispatchTransferSchema.parse(rawInput);
  const targetDb = externalDb ?? db;

  const run = async (tx: Tx) => {
    // 1. Lock transfer FOR UPDATE
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

    if (transfer.status !== "draft") {
      throw new DomainError(
        "INVALID_STATE",
        `Only draft transfers can be dispatched. Current status: ${transfer.status}`,
      );
    }

    // 2. Fetch items for this transfer
    const items = await tx
      .select()
      .from(schema.stockTransferItems)
      .where(eq(schema.stockTransferItems.transferId, transfer.id));

    if (items.length === 0) {
      throw new DomainError("EMPTY_TRANSFER", "Cannot dispatch transfer with no line items");
    }

    const itemOverrideMap = new Map(
      (input.items ?? []).map((i) => [i.itemId, i.qtyDispatched]),
    );

    // 3. Concurrency safety: Sort by fromBatchId deterministically to avoid deadlocks
    const sortedItems = [...items].sort((a, b) => a.fromBatchId.localeCompare(b.fromBatchId));

    for (const item of sortedItems) {
      const dispatchQty = itemOverrideMap.get(item.id) ?? item.qty;
      if (dispatchQty <= 0) {
        throw new DomainError("INVALID_QTY", `Dispatched quantity must be positive for batch ${item.batchNo}`);
      }

      // recordStockMovement locks the batch row FOR UPDATE, verifies qtyOnHand,
      // updates batch qtyOnHand, and inserts stockMovements ledger row.
      await recordStockMovement({
        tx,
        tenantId: ctx.tenantId,
        storeId: transfer.fromStoreId,
        batchId: item.fromBatchId,
        medicineId: item.medicineId,
        type: "transfer_out",
        qtyChange: -dispatchQty,
        unitCost: item.unitCost ?? undefined,
        refType: "stock_transfer",
        refId: transfer.id,
        note: `Transfer out to destination store. Transfer #${transfer.transferNo}`,
        userId: ctx.userId,
      });

      // Update qtyDispatched on the item
      await tx
        .update(schema.stockTransferItems)
        .set({
          qtyDispatched: dispatchQty,
          updatedAt: new Date(),
        })
        .where(eq(schema.stockTransferItems.id, item.id));
    }

    // 4. Statutory routing (Rule 55 Delivery Challan vs Rule 46 Tax Invoice)
    const [fromStore] = await tx
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        address: schema.stores.address,
        gstin: schema.stores.gstin,
        stateCode: schema.stores.stateCode,
      })
      .from(schema.stores)
      .where(eq(schema.stores.id, transfer.fromStoreId));

    const [toStore] = await tx
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        address: schema.stores.address,
        gstin: schema.stores.gstin,
        stateCode: schema.stores.stateCode,
      })
      .from(schema.stores)
      .where(eq(schema.stores.id, transfer.toStoreId));

    const statutoryLines = sortedItems.map((item) => ({
      qty: itemOverrideMap.get(item.id) ?? item.qty,
      unitCost: item.unitCost ?? 0,
      gstRateBp: item.gstRateBp ?? 0,
    }));

    const routing = determineStatutoryRouting(fromStore, toStore, statutoryLines);

    const docPrefix = routing.docKind === "tax_invoice" ? "TI" : "DC";
    const docType = routing.docKind === "tax_invoice" ? "invoice" : "challan";
    const documentNo = await nextDocNumber(
      tx,
      ctx.tenantId,
      transfer.fromStoreId,
      docType,
      docPrefix,
    );

    // 5. Update transfer header to dispatched
    const now = new Date();
    await tx
      .update(schema.stockTransfers)
      .set({
        status: "dispatched",
        docKind: routing.docKind,
        documentNo,
        documentDate: now,
        gstinSourceSnapshot: fromStore.gstin ?? null,
        gstinDestSnapshot: toStore.gstin ?? null,
        sourceAddressSnapshot: fromStore.address ?? null,
        destAddressSnapshot: toStore.address ?? null,
        placeOfSupply: routing.placeOfSupply,
        transportMode: input.transportMode,
        vehicleNo: input.vehicleNo ?? null,
        transporterName: input.transporterName ?? null,
        transporterId: input.transporterId ?? null,
        eWayBillNo: input.eWayBillNo ?? null,
        eWayBillDate: input.eWayBillNo ? now : null,
        taxableValuePaise: routing.taxableValuePaise,
        cgstPaise: routing.cgstPaise,
        sgstPaise: routing.sgstPaise,
        igstPaise: routing.igstPaise,
        totalValuePaise: routing.totalValuePaise,
        dispatchedBy: ctx.userId,
        dispatchedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.stockTransfers.id, transfer.id));

    // 6. Audit log
    await writeAudit(
      tx,
      { tenantId: ctx.tenantId, storeId: transfer.fromStoreId, userId: ctx.userId },
      {
        action: "update",
        entityType: "stock_transfer",
        entityId: transfer.id,
        newValue: {
          status: "dispatched",
          documentNo,
          docKind: routing.docKind,
          totalValuePaise: routing.totalValuePaise,
        },
      },
    );

    return {
      transferId: transfer.id,
      transferNo: transfer.transferNo,
      status: "dispatched",
      documentNo,
      docKind: routing.docKind,
      eWayBillRequired: routing.eWayBillRequired,
    };
  };

  return targetDb.transaction(run);
}
