"use server";

import { z } from "zod";
import { db, schema } from "@/server/db";
import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { protectedAction } from "@/server/action";
import { requirePermission, type AuthCtx } from "@/server/rbac";
import { ForbiddenError } from "@/server/errors";
import {
  computeReorderSuggestions,
  ReorderSuggestionsReport,
} from "@/server/domain/purchasing/reorder";
import { createPurchaseOrder } from "@/server/domain/purchasing/purchase-orders";

async function assertStoreAccess(ctx: AuthCtx, targetStoreId: string): Promise<string> {
  if (ctx.allowedStoreIds !== "all" && !ctx.allowedStoreIds.includes(targetStoreId)) {
    throw new ForbiddenError("store.access");
  }
  const [store] = await db
    .select({ id: schema.stores.id })
    .from(schema.stores)
    .where(and(eq(schema.stores.id, targetStoreId), eq(schema.stores.tenantId, ctx.tenantId)))
    .limit(1);
  if (!store) {
    throw new ForbiddenError("store.access");
  }
  return store.id;
}

/**
 * Plain server component read: fetch reorder suggestions for a store
 */
export async function getReorderSuggestions(
  storeId?: string,
  filters?: { supplierId?: string; search?: string; includeNeverStocked?: boolean }
): Promise<ReorderSuggestionsReport> {
  const ctx = await requirePermission("purchase.view");
  const targetStoreId = storeId ? await assertStoreAccess(ctx, storeId) : ctx.storeId;
  return computeReorderSuggestions(ctx.tenantId, targetStoreId, filters);
}

/**
 * Get available active stores for reorder evaluation
 */
export async function getReorderStoresAction() {
  const ctx = await requirePermission("purchase.view");
  const canViewAll = ctx.allowedStoreIds === "all" || ctx.permissions.has("report.all_stores");
  if (!canViewAll && Array.isArray(ctx.allowedStoreIds)) {
    return db
      .select({ id: schema.stores.id, name: schema.stores.name, code: schema.stores.code })
      .from(schema.stores)
      .where(
        and(
          eq(schema.stores.tenantId, ctx.tenantId),
          eq(schema.stores.isActive, true),
          inArray(schema.stores.id, ctx.allowedStoreIds)
        )
      );
  }
  if (!canViewAll) {
    return db
      .select({ id: schema.stores.id, name: schema.stores.name, code: schema.stores.code })
      .from(schema.stores)
      .where(
        and(
          eq(schema.stores.tenantId, ctx.tenantId),
          eq(schema.stores.isActive, true),
          eq(schema.stores.id, ctx.storeId)
        )
      );
  }
  return db
    .select({ id: schema.stores.id, name: schema.stores.name, code: schema.stores.code })
    .from(schema.stores)
    .where(and(eq(schema.stores.tenantId, ctx.tenantId), eq(schema.stores.isActive, true)));
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
    const validatedStoreId = parsedInput.storeId
      ? await assertStoreAccess(ctx, parsedInput.storeId)
      : ctx.storeId;

    const effectiveCtx = { ...ctx, storeId: validatedStoreId };

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
