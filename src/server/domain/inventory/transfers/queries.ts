import { and, desc, eq, or } from "drizzle-orm";
import { db, schema, type DbOrTx } from "@/server/db";
import { DomainError } from "@/server/errors";

export interface ListTransfersParams {
  storeId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export async function listTransfers(
  tenantId: string,
  params: ListTransfersParams = {},
  database: DbOrTx = db,
) {
  const conditions = [eq(schema.stockTransfers.tenantId, tenantId)];

  if (params.storeId) {
    conditions.push(
      or(
        eq(schema.stockTransfers.fromStoreId, params.storeId),
        eq(schema.stockTransfers.toStoreId, params.storeId),
      )!,
    );
  }

  if (params.status && params.status !== "all") {
    conditions.push(eq(schema.stockTransfers.status, params.status));
  }

  const limit = Math.min(params.limit ?? 50, 100);
  const offset = params.offset ?? 0;

  const transfers = await database
    .select({
      id: schema.stockTransfers.id,
      transferNo: schema.stockTransfers.transferNo,
      fromStoreId: schema.stockTransfers.fromStoreId,
      toStoreId: schema.stockTransfers.toStoreId,
      status: schema.stockTransfers.status,
      docKind: schema.stockTransfers.docKind,
      documentNo: schema.stockTransfers.documentNo,
      documentDate: schema.stockTransfers.documentDate,
      totalValuePaise: schema.stockTransfers.totalValuePaise,
      transportMode: schema.stockTransfers.transportMode,
      vehicleNo: schema.stockTransfers.vehicleNo,
      createdAt: schema.stockTransfers.createdAt,
      dispatchedAt: schema.stockTransfers.dispatchedAt,
      receivedAt: schema.stockTransfers.receivedAt,
    })
    .from(schema.stockTransfers)
    .where(and(...conditions))
    .orderBy(desc(schema.stockTransfers.createdAt))
    .limit(limit)
    .offset(offset);

  // Fetch store names
  const storeIds = new Set<string>();
  transfers.forEach((t) => {
    storeIds.add(t.fromStoreId);
    storeIds.add(t.toStoreId);
  });

  const stores = storeIds.size > 0
    ? await database
        .select({ id: schema.stores.id, name: schema.stores.name })
        .from(schema.stores)
        .where(eq(schema.stores.tenantId, tenantId))
    : [];

  const storeMap = new Map(stores.map((s) => [s.id, s.name]));

  return transfers.map((t) => ({
    ...t,
    fromStoreName: storeMap.get(t.fromStoreId) ?? "Unknown Store",
    toStoreName: storeMap.get(t.toStoreId) ?? "Unknown Store",
  }));
}

export async function getTransferById(
  tenantId: string,
  transferId: string,
  database: DbOrTx = db,
) {
  const [transfer] = await database
    .select()
    .from(schema.stockTransfers)
    .where(
      and(
        eq(schema.stockTransfers.id, transferId),
        eq(schema.stockTransfers.tenantId, tenantId),
      ),
    );

  if (!transfer) {
    throw new DomainError("TRANSFER_NOT_FOUND", `Transfer ${transferId} not found`);
  }

  const [fromStore] = await database
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      address: schema.stores.address,
      gstin: schema.stores.gstin,
      stateCode: schema.stores.stateCode,
    })
    .from(schema.stores)
    .where(eq(schema.stores.id, transfer.fromStoreId));

  const [toStore] = await database
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      address: schema.stores.address,
      gstin: schema.stores.gstin,
      stateCode: schema.stores.stateCode,
    })
    .from(schema.stores)
    .where(eq(schema.stores.id, transfer.toStoreId));

  const items = await database
    .select({
      id: schema.stockTransferItems.id,
      transferId: schema.stockTransferItems.transferId,
      medicineId: schema.stockTransferItems.medicineId,
      medicineName: schema.medicines.name,
      fromBatchId: schema.stockTransferItems.fromBatchId,
      toBatchId: schema.stockTransferItems.toBatchId,
      batchNo: schema.stockTransferItems.batchNo,
      expiryDate: schema.stockTransferItems.expiryDate,
      mfgDate: schema.stockTransferItems.mfgDate,
      hsn: schema.stockTransferItems.hsn,
      qty: schema.stockTransferItems.qty,
      qtyDispatched: schema.stockTransferItems.qtyDispatched,
      receivedQty: schema.stockTransferItems.receivedQty,
      qtyDamaged: schema.stockTransferItems.qtyDamaged,
      qtyShortage: schema.stockTransferItems.qtyShortage,
      unitCost: schema.stockTransferItems.unitCost,
      mrp: schema.stockTransferItems.mrp,
      saleRate: schema.stockTransferItems.saleRate,
      gstRateBp: schema.stockTransferItems.gstRateBp,
      discrepancyReason: schema.stockTransferItems.discrepancyReason,
    })
    .from(schema.stockTransferItems)
    .innerJoin(schema.medicines, eq(schema.stockTransferItems.medicineId, schema.medicines.id))
    .where(eq(schema.stockTransferItems.transferId, transfer.id));

  const receiptEvents = await database
    .select()
    .from(schema.stockTransferReceiptEvents)
    .where(eq(schema.stockTransferReceiptEvents.transferId, transfer.id))
    .orderBy(desc(schema.stockTransferReceiptEvents.receivedAt));

  return {
    ...transfer,
    fromStore,
    toStore,
    items,
    receiptEvents,
  };
}
