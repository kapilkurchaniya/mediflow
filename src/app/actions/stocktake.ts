"use server";

import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { writeAudit } from "@/server/audit";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import {
  createStockAuditSession,
  recordStockAuditCounts,
  approveStockAuditSession,
  cancelStockAuditSession,
  getStockAuditSessionDetails,
  listStockAuditSessions,
} from "@/server/domain/inventory/stocktake";

export async function listStockAuditSessionsAction(options?: { storeId?: string }) {
  const ctx = await requirePermission("inventory.view");
  const storeId = options?.storeId || ctx.storeId;

  return listStockAuditSessions(db, {
    tenantId: ctx.tenantId,
    storeId,
  });
}

export async function getStockAuditSessionAction(sessionId: string) {
  const ctx = await requirePermission("inventory.view");
  const isOwnerOrManager =
    ctx.permissions.has("inventory.adjust") ||
    ctx.permissions.has("report.all_stores");

  return getStockAuditSessionDetails(db, {
    tenantId: ctx.tenantId,
    sessionId,
    isBlindStaffView: !isOwnerOrManager,
  });
}

export async function getStoreRacksAction(storeId?: string) {
  const ctx = await requirePermission("inventory.view");
  const targetStoreId = storeId || ctx.storeId;

  const racks = await db
    .select({
      id: schema.racks.id,
      code: schema.racks.code,
      name: schema.racks.name,
      description: schema.racks.description,
      isActive: schema.racks.isActive,
    })
    .from(schema.racks)
    .where(
      and(
        eq(schema.racks.tenantId, ctx.tenantId),
        eq(schema.racks.storeId, targetStoreId),
        eq(schema.racks.isActive, true)
      )
    )
    .orderBy(schema.racks.code);

  return racks;
}

export async function createStockAuditSessionAction(params: {
  storeId?: string;
  scope: "full_store" | "racks";
  rackIds?: string[];
  blindCount?: boolean;
  notes?: string;
}) {
  const ctx = await requirePermission("inventory.adjust");
  const storeId = params.storeId || ctx.storeId;

  try {
    const session = await db.transaction(async (tx) => {
      const s = await createStockAuditSession(tx, {
        tenantId: ctx.tenantId,
        storeId,
        scope: params.scope,
        rackIds: params.rackIds,
        blindCount: params.blindCount ?? true,
        notes: params.notes,
        userId: ctx.userId,
      });

      await writeAudit(
        tx,
        {
          tenantId: ctx.tenantId,
          storeId,
          userId: ctx.userId,
        },
        {
          action: "create",
          entityType: "stock_audit_session",
          entityId: s.sessionId,
          newValue: {
            sessionNo: s.sessionNo,
            scope: params.scope,
            itemCount: s.totalItemsSnapshotted,
            blindCount: params.blindCount ?? true,
          },
        }
      );

      return s;
    });

    revalidatePath("/dashboard/inventory/stocktake");

    return {
      success: true,
      sessionId: session.sessionId,
      sessionNo: session.sessionNo,
      totalItemsSnapshotted: session.totalItemsSnapshotted,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create audit session";
    return { success: false, error: message };
  }
}

export async function recordStockAuditCountsAction(params: {
  sessionId: string;
  counts: Array<{ itemId: string; countedQty: number }>;
}) {
  const ctx = await requirePermission("inventory.view");

  try {
    await db.transaction(async (tx) => {
      await recordStockAuditCounts(tx, {
        tenantId: ctx.tenantId,
        sessionId: params.sessionId,
        counts: params.counts,
        userId: ctx.userId,
      });
    });

    revalidatePath(`/dashboard/inventory/stocktake/${params.sessionId}`);
    revalidatePath("/dashboard/inventory/stocktake");

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record audit counts";
    return { success: false, error: message };
  }
}

export async function approveStockAuditSessionAction(params: {
  sessionId: string;
  notes?: string;
}) {
  const ctx = await requirePermission("inventory.adjust");

  try {
    const result = await db.transaction(async (tx) => {
      const res = await approveStockAuditSession(tx, {
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        sessionId: params.sessionId,
        userId: ctx.userId,
        notes: params.notes,
      });

      await writeAudit(
        tx,
        {
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          userId: ctx.userId,
        },
        {
          action: "stock_adjust",
          entityType: "stock_audit_session",
          entityId: params.sessionId,
          newValue: {
            reconciledAdjustmentsCount: res.reconciledAdjustmentsCount,
            netFinancialImpactPaise: res.netFinancialImpactPaise,
            status: "approved",
          },
        }
      );

      return res;
    });

    revalidatePath(`/dashboard/inventory/stocktake/${params.sessionId}`);
    revalidatePath("/dashboard/inventory/stocktake");
    revalidatePath("/dashboard/inventory/batches");
    revalidatePath("/dashboard/accounting");

    return { success: true, ...result };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to approve audit session";
    return { success: false, error: message };
  }
}

export async function cancelStockAuditSessionAction(params: { sessionId: string }) {
  const ctx = await requirePermission("inventory.adjust");

  try {
    await db.transaction(async (tx) => {
      await cancelStockAuditSession(tx, {
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        sessionId: params.sessionId,
        userId: ctx.userId,
      });

      await writeAudit(
        tx,
        {
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          userId: ctx.userId,
        },
        {
          action: "cancel",
          entityType: "stock_audit_session",
          entityId: params.sessionId,
        }
      );
    });

    revalidatePath(`/dashboard/inventory/stocktake/${params.sessionId}`);
    revalidatePath("/dashboard/inventory/stocktake");

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to cancel audit session";
    return { success: false, error: message };
  }
}

