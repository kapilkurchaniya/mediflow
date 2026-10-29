"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { revalidatePath } from "next/cache";
import { protectedAction } from "@/server/action";
import { requirePermission } from "@/server/rbac";
import {
  CreatePurchaseOrderSchema,
  createPurchaseOrder,
  approvePurchaseOrder,
  markPurchaseOrderSent,
  cancelPurchaseOrder,
  getPurchaseOrderById,
  listPurchaseOrders,
} from "@/server/domain/purchasing/purchase-orders";

function revalidatePOPaths(id?: string) {
  revalidatePath("/dashboard/purchases");
  revalidatePath("/dashboard/purchases/orders");
  if (id) {
    revalidatePath(`/dashboard/purchases/orders/${id}`);
    revalidatePath(`/dashboard/purchases/orders/${id}/print`);
  }
}

/** Plain Server Component read: list purchase orders */
export async function getPurchaseOrders(filters?: { status?: string; supplierId?: string }) {
  const ctx = await requirePermission("purchase.view");
  return listPurchaseOrders(db, ctx.tenantId, ctx.storeId, filters);
}

/** Plain Server Component read: get purchase order by ID */
export async function getPurchaseOrder(id: string) {
  const ctx = await requirePermission("purchase.view");
  return getPurchaseOrderById(db, ctx.tenantId, id);
}

/** Action: Create Purchase Order (Draft) */
export const createPurchaseOrderAction = protectedAction("purchase.create")
  .schema(CreatePurchaseOrderSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await db.transaction(async (tx) => {
      return createPurchaseOrder(tx, ctx, parsedInput);
    });

    revalidatePOPaths(result.id);
    return result;
  });

/** Action: Approve Purchase Order */
export const approvePurchaseOrderAction = protectedAction("purchase.approve")
  .schema(z.object({ poId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await db.transaction(async (tx) => {
      return approvePurchaseOrder(tx, ctx, parsedInput.poId);
    });

    revalidatePOPaths(parsedInput.poId);
    return result;
  });

/** Action: Mark Purchase Order as Sent */
export const markPurchaseOrderSentAction = protectedAction("purchase.create")
  .schema(z.object({ poId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await db.transaction(async (tx) => {
      return markPurchaseOrderSent(tx, ctx, parsedInput.poId);
    });

    revalidatePOPaths(parsedInput.poId);
    return result;
  });

/** Action: Cancel Purchase Order */
export const cancelPurchaseOrderAction = protectedAction("purchase.create")
  .schema(z.object({ poId: z.string().uuid(), reason: z.string().min(1, "Reason is required").max(500) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await db.transaction(async (tx) => {
      return cancelPurchaseOrder(tx, ctx, parsedInput.poId, parsedInput.reason);
    });

    revalidatePOPaths(parsedInput.poId);
    return result;
  });

