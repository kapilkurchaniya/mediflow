"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { revalidatePath } from "next/cache";
import { protectedAction } from "@/server/action";
import { requirePermission } from "@/server/rbac";
import {
  computeReorderSuggestions,
  ReorderSuggestionsReport,
} from "@/server/domain/purchasing/reorder";
import { createPurchaseOrder } from "@/server/domain/purchasing/purchase-orders";

/**
 * Plain server component read: fetch reorder suggestions for a store
 */
export async function getReorderSuggestions(
  storeId?: string,
  filters?: { supplierId?: string; search?: string }
): Promise<ReorderSuggestionsReport> {
  const ctx = await requirePermission("purchase.view");
  const targetStoreId = storeId || ctx.storeId;
  return computeReorderSuggestions(ctx.tenantId, targetStoreId, filters);
}

const CreatePoFromReorderSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier ID"),
  storeId: z.string().uuid().optional(),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        medicineId: z.string().uuid(),
        qty: z.number().int().positive(),
        rate: z.number().int().min(0),
        freeQty: z.number().int().min(0).default(0),
      })
    )
    .min(1, "Select at least one item"),
});

/**
 * Action: Create a draft Purchase Order from reorder suggestions
 */
export const createPoFromReorderAction = protectedAction("purchase.create")
  .schema(CreatePoFromReorderSchema)
  .action(async ({ parsedInput, ctx }) => {
    const effectiveCtx = parsedInput.storeId
      ? { ...ctx, storeId: parsedInput.storeId }
      : ctx;

    const result = await db.transaction(async (tx) => {
      return createPurchaseOrder(tx, effectiveCtx, {
        supplierId: parsedInput.supplierId,
        expectedDate: parsedInput.expectedDate,
        notes: parsedInput.notes || "Auto-generated from reorder suggestions engine",
        items: parsedInput.items,
      });
    });

    revalidatePath("/dashboard/purchases");
    revalidatePath("/dashboard/purchases/orders");
    revalidatePath("/dashboard/purchases/reorder");

    return result;
  });

