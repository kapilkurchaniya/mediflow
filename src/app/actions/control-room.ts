"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import type { StoreSettings } from "@/server/db/schema/platform";
import { requirePermission } from "@/server/rbac";
import { writeAudit } from "@/server/audit";
import {
  getBusinessAnalysisReport,
  type PivotRow,
} from "@/server/domain/reports/business-analysis";

export async function getControlRoomDataAction() {
  const ctx = await requirePermission("settings.manage");
  const [[store], auditRows] = await Promise.all([
    db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        settings: schema.stores.settings,
      })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, ctx.storeId), eq(schema.stores.tenantId, ctx.tenantId)))
      .limit(1),
    db
      .select({
        id: schema.auditLogs.id,
        action: schema.auditLogs.action,
        entityType: schema.auditLogs.entityType,
        entityId: schema.auditLogs.entityId,
        userId: schema.auditLogs.userId,
        createdAt: schema.auditLogs.createdAt,
      })
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.tenantId, ctx.tenantId))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(100),
  ]);

  return {
    storeName: store?.name ?? "Pharmacy Store",
    settings: (store?.settings ?? {}) as StoreSettings,
    auditLogs: auditRows.map((a) => ({
      id: String(a.id),
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId ?? "",
      userId: a.userId ?? "",
      createdAtIso: a.createdAt.toISOString(),
    })),
  };
}

export async function updateControlRoomSettingsAction(
  patch: StoreSettings,
): Promise<{ success: boolean; error?: string }> {
  try {
    const ctx = await requirePermission("settings.manage");
    const [store] = await db
      .select({ settings: schema.stores.settings })
      .from(schema.stores)
      .where(and(eq(schema.stores.id, ctx.storeId), eq(schema.stores.tenantId, ctx.tenantId)))
      .limit(1);

    const merged: StoreSettings = { ...(store?.settings ?? {}), ...patch };

    await db.transaction(async (tx) => {
      await tx
        .update(schema.stores)
        .set({ settings: merged })
        .where(and(eq(schema.stores.id, ctx.storeId), eq(schema.stores.tenantId, ctx.tenantId)));

      await writeAudit(tx, ctx, {
        action: "update",
        entityType: "store_control_room",
        entityId: ctx.storeId,
        newValue: merged as Record<string, unknown>,
      });
    });

    revalidatePath("/dashboard/settings");
    revalidatePath("/dashboard/settings/control-room");
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save Control Room settings" };
  }
}

export async function exportTenantBackupJsonAction(): Promise<{
  success: boolean;
  backupJson?: string;
  error?: string;
}> {
  try {
    const ctx = await requirePermission("report.export");
    const [medicines, batches, customers, suppliers] = await Promise.all([
      db.select().from(schema.medicines).where(eq(schema.medicines.tenantId, ctx.tenantId)).limit(5000),
      db.select().from(schema.batches).where(eq(schema.batches.tenantId, ctx.tenantId)).limit(10000),
      db.select().from(schema.customers).where(eq(schema.customers.tenantId, ctx.tenantId)).limit(5000),
      db.select().from(schema.suppliers).where(eq(schema.suppliers.tenantId, ctx.tenantId)).limit(2000),
    ]);

    const backup = {
      exportedAt: new Date().toISOString(),
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      counts: {
        medicines: medicines.length,
        batches: batches.length,
        customers: customers.length,
        suppliers: suppliers.length,
      },
      data: { medicines, batches, customers, suppliers },
    };

    return { success: true, backupJson: JSON.stringify(backup, null, 2) };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to export backup" };
  }
}

export async function getBusinessAnalysisAction(input: {
  from: string;
  to: string;
  dimension: "category" | "manufacturer" | "medicine";
}): Promise<{ success: boolean; rows?: PivotRow[]; error?: string }> {
  try {
    const ctx = await requirePermission("report.view");
    const rows = await getBusinessAnalysisReport(db, {
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      from: input.from,
      to: input.to,
      dimension: input.dimension,
    });
    return { success: true, rows };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load business analysis" };
  }
}
