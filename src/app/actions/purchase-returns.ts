"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { protectedAction } from "@/server/action";
import { revalidatePath } from "next/cache";
import { PENDING_SUPPLIER_PLACEHOLDER_NAME } from "@/lib/pending-supplier";
import {
  createPurchaseReturn,
  CreatePurchaseReturnSchema,
  getPurchaseReturnById,
  listPurchaseReturns,
  getBatchesForExpiryReturn,
  type CreatePurchaseReturnInput,
  type PurchaseReturnDetail,
  type ExpiryReturnCandidate,
} from "@/server/domain/purchasing/purchase-returns";

export type { CreatePurchaseReturnInput, PurchaseReturnDetail, ExpiryReturnCandidate };

export const createPurchaseReturnAction = protectedAction("purchase.return")
  .schema(CreatePurchaseReturnSchema)
  .action(async ({ parsedInput, ctx }) => {
    const returnRecord = await db.transaction(async (tx) => {
      return createPurchaseReturn(tx, ctx, parsedInput);
    });

    revalidatePath("/dashboard/purchases/returns");
    revalidatePath("/dashboard/purchases/expiry-returns");
    revalidatePath("/dashboard/purchases");
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/quarantine");
    revalidatePath(`/dashboard/purchases/${parsedInput.purchaseId}`);

    return {
      success: true,
      returnId: returnRecord.id,
      returnNo: returnRecord.returnNo,
    };
  });

export async function getPurchaseReturns(options?: {
  supplierId?: string;
  limit?: number;
  offset?: number;
}) {
  const ctx = await requirePermission("purchase.view");
  return listPurchaseReturns(db, ctx.tenantId, ctx.storeId, options);
}

export async function getPurchaseReturn(returnId: string) {
  const ctx = await requirePermission("purchase.view");
  return getPurchaseReturnById(db, ctx.tenantId, ctx.storeId, returnId);
}

export async function getExpiryReturnCandidatesAction(daysAhead = 60) {
  const ctx = await requirePermission("purchase.view");
  return getBatchesForExpiryReturn(db, ctx.tenantId, ctx.storeId, daysAhead);
}

/**
 * Loads a purchase with its items and current batch stock for initiating a return.
 */
export async function getPurchaseForReturn(purchaseId: string) {
  const ctx = await requirePermission("purchase.view");

  const [res] = await db
    .select({
      purchase: schema.purchases,
      supplier: schema.suppliers,
    })
    .from(schema.purchases)
    .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .where(
      and(
        eq(schema.purchases.id, purchaseId),
        eq(schema.purchases.tenantId, ctx.tenantId),
        eq(schema.purchases.storeId, ctx.storeId)
      )
    )
    .limit(1);

  if (!res) return null;

  const items = await db
    .select({
      item: schema.purchaseItems,
      med: schema.medicines,
      batch: schema.batches,
    })
    .from(schema.purchaseItems)
    .innerJoin(schema.medicines, eq(schema.purchaseItems.medicineId, schema.medicines.id))
    .innerJoin(schema.batches, eq(schema.purchaseItems.batchId, schema.batches.id))
    .where(
      and(
        eq(schema.purchaseItems.purchaseId, purchaseId),
        eq(schema.purchaseItems.tenantId, ctx.tenantId)
      )
    );

  const supplierDisplay =
    res.supplier.name === PENDING_SUPPLIER_PLACEHOLDER_NAME
      ? {
          ...res.supplier,
          name: res.purchase.pendingSupplierMeta?.name
            ? `${res.purchase.pendingSupplierMeta.name} (Unregistered)`
            : "Unregistered Supplier",
        }
      : res.supplier;

  return {
    purchase: res.purchase,
    supplier: supplierDisplay,
    items: items.map((i) => ({
      ...i.item,
      medicineName: i.med.name,
      currentBatchStock: i.batch.qtyOnHand,
      availableToReturn: Math.min(
        i.item.qty - (i.item.returnedQty ?? 0),
        i.batch.qtyOnHand
      ),
    })),
  };
}
