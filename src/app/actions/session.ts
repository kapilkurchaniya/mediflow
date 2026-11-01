"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/server/db";
import { getCurrentSession } from "@/server/auth";
import {
  switchStore,
  listAllowedStores,
  type StoreSwitchResult,
  type AllowedStoreItem,
} from "@/server/domain/stores";

const SwitchStoreInputSchema = z.object({
  storeId: z.string().uuid("Invalid store ID format"),
});

/**
 * Switches the active store for the signed-in user's session.
 * Updates session.store_id, memberships.last_store_id, and writes an audit log.
 */
export async function switchStoreAction(
  targetStoreId: string,
): Promise<{ success: boolean; data?: StoreSwitchResult; error?: string }> {
  try {
    const parsed = SwitchStoreInputSchema.parse({ storeId: targetStoreId });
    const { session, user } = await getCurrentSession();

    if (!session || !session.tenantId || !user) {
      return { success: false, error: "Unauthorized session" };
    }

    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;

    const result = await switchStore(db, {
      sessionId: session.id,
      userId: user.id,
      tenantId: session.tenantId,
      targetStoreId: parsed.storeId,
      currentStoreId: session.storeId ?? undefined,
      ip,
    });

    revalidatePath("/dashboard", "layout");
    return { success: true, data: result };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to switch store";
    return { success: false, error: message };
  }
}

/**
 * Lists all active stores that the current signed-in user is permitted to access.
 */
export async function getAllowedStoresAction(): Promise<{
  success: boolean;
  stores?: AllowedStoreItem[];
  error?: string;
}> {
  try {
    const { session, user } = await getCurrentSession();
    if (!session || !session.tenantId || !user) {
      return { success: false, error: "Unauthorized" };
    }

    const stores = await listAllowedStores(db, {
      tenantId: session.tenantId,
      userId: user.id,
    });

    return { success: true, stores };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to load allowed stores";
    return { success: false, error: message };
  }
}
