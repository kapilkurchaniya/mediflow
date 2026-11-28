"use server";

import { db } from "@/server/db";
import { getAuthCtx } from "@/server/rbac";
import { getStoreNotifications, type StoreAlertItem } from "@/server/domain/notifications/alerts";

export async function getStoreNotificationsAction(): Promise<StoreAlertItem[]> {
  try {
    const ctx = await getAuthCtx();
    return await getStoreNotifications(db, ctx.tenantId, ctx.storeId);
  } catch {
    return [];
  }
}
