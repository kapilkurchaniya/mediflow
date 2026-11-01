"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { protectedAction } from "@/server/action";
import { requirePermission } from "@/server/rbac";
import {
  createStore,
  updateStore,
  deactivateStore,
  reactivateStore,
  listStores,
  getStore,
  CreateStoreInputSchema,
  UpdateStoreInputSchema,
  type StoreListFilter,
} from "@/server/domain/stores";

const refresh = () => {
  revalidatePath("/dashboard/settings/stores");
  revalidatePath("/dashboard/sales/pos");
};

/**
 * Lists all stores for the tenant.
 * Requires `store.manage` or `settings.manage` permission.
 */
export async function getStoresAction(filter?: StoreListFilter) {
  const ctx = await requirePermission("store.manage");
  return listStores(db, ctx.tenantId, filter);
}

/**
 * Retrieves a single store's details for editing.
 */
export async function getStoreAction(storeId: string) {
  const ctx = await requirePermission("store.manage");
  return getStore(db, ctx.tenantId, storeId);
}

/**
 * Creates a new store or warehouse location.
 */
export const createStoreAction = protectedAction("store.manage")
  .inputSchema(CreateStoreInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const store = await db.transaction((tx) => createStore(tx, ctx, parsedInput));
    refresh();
    return { success: true, store };
  });

/**
 * Updates an existing store configuration.
 */
export const updateStoreAction = protectedAction("store.manage")
  .inputSchema(
    z.object({
      storeId: z.string().uuid(),
      data: UpdateStoreInputSchema,
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const store = await db.transaction((tx) =>
      updateStore(tx, ctx, parsedInput.storeId, parsedInput.data),
    );
    refresh();
    return { success: true, store };
  });

/**
 * Safely deactivates a store branch.
 */
export const deactivateStoreAction = protectedAction("store.manage")
  .inputSchema(z.object({ storeId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const store = await db.transaction((tx) => deactivateStore(tx, ctx, parsedInput.storeId));
    refresh();
    return { success: true, store };
  });

/**
 * Reactivates a deactivated store branch.
 */
export const reactivateStoreAction = protectedAction("store.manage")
  .inputSchema(z.object({ storeId: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const store = await db.transaction((tx) => reactivateStore(tx, ctx, parsedInput.storeId));
    refresh();
    return { success: true, store };
  });
