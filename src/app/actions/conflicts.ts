"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import {
  getConflictDetails,
  listStoreConflicts,
  resolveWithBatchReallocation,
  resolveWithPhysicalRecount,
  dismissConflictCase,
  setConflictInvestigating,
} from "@/server/domain/conflicts";

export async function listStockConflictsAction(filters?: { status?: string }) {
  const ctx = await requirePermission("inventory.view");
  try {
    const data = await listStoreConflicts(db, {
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      status: filters?.status,
    });
    return { success: true, data };
  } catch (err: unknown) {
    const error = err as Error;
    return { success: false, error: error.message || "Failed to list stock conflicts" };
  }
}

export async function getConflictDetailsAction(conflictCaseId: string) {
  const ctx = await requirePermission("inventory.view");
  try {
    const data = await getConflictDetails(db, {
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      conflictCaseId,
    });

    // Mark as investigating if open
    await setConflictInvestigating(db, {
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      conflictCaseId,
      userId: ctx.userId,
    });

    return { success: true, data };
  } catch (err: unknown) {
    const error = err as Error;
    return { success: false, error: error.message || "Failed to get conflict details" };
  }
}

export async function resolveConflictRecountAction(input: {
  conflictCaseId: string;
  observedCount: number;
  notes?: string;
}) {
  const ctx = await requirePermission("inventory.adjust");
  try {
    const operationKey = `recount:${input.conflictCaseId}:${Date.now()}`;
    const result = await resolveWithPhysicalRecount(db, {
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      conflictCaseId: input.conflictCaseId,
      observedCount: input.observedCount,
      userId: ctx.userId,
      notes: input.notes,
      operationKey,
    });

    revalidatePath("/dashboard/inventory/conflicts");
    return { success: true, data: result };
  } catch (err: unknown) {
    const error = err as Error;
    return { success: false, error: error.message || "Failed to resolve conflict with recount" };
  }
}

export async function resolveConflictReallocationAction(input: {
  conflictCaseId: string;
  targetBatchId: string;
  reallocateQty: number;
  dispensingEvidence: string;
}) {
  const ctx = await requirePermission("inventory.adjust");
  try {
    const operationKey = `reallocate:${input.conflictCaseId}:${input.targetBatchId}:${Date.now()}`;
    const result = await resolveWithBatchReallocation(db, {
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      conflictCaseId: input.conflictCaseId,
      targetBatchId: input.targetBatchId,
      reallocateQty: input.reallocateQty,
      userId: ctx.userId,
      dispensingEvidence: input.dispensingEvidence,
      operationKey,
    });

    revalidatePath("/dashboard/inventory/conflicts");
    return { success: true, data: result };
  } catch (err: unknown) {
    const error = err as Error;
    return { success: false, error: error.message || "Failed to reallocate batch" };
  }
}

export async function dismissConflictCaseAction(input: {
  conflictCaseId: string;
  reason: string;
}) {
  const ctx = await requirePermission("inventory.adjust");
  try {
    const operationKey = `dismiss:${input.conflictCaseId}:${Date.now()}`;
    const result = await dismissConflictCase(db, {
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      conflictCaseId: input.conflictCaseId,
      userId: ctx.userId,
      reason: input.reason,
      operationKey,
    });

    revalidatePath("/dashboard/inventory/conflicts");
    return { success: true, data: result };
  } catch (err: unknown) {
    const error = err as Error;
    return { success: false, error: error.message || "Failed to dismiss conflict case" };
  }
}
