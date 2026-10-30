"use server";

import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { writeAudit } from "@/server/audit";
import { revalidatePath } from "next/cache";
import {
  computeExpiryRedistribution,
  createRedistributionTransferDraft,
  type ExpiryRedistributionReport,
} from "@/server/domain/inventory/expiry-redistribution";
import { eq, and } from "drizzle-orm";

export async function getExpiryRedistributionReportAction(options?: {
  sourceStoreId?: string;
  minDays?: number;
  maxDays?: number;
  search?: string;
}): Promise<ExpiryRedistributionReport> {
  const ctx = await requirePermission("report.view");

  return computeExpiryRedistribution(ctx.tenantId, {
    sourceStoreId: options?.sourceStoreId,
    minDays: options?.minDays,
    maxDays: options?.maxDays,
    search: options?.search,
  });
}

export async function getActiveStoresForRedistributionAction(): Promise<
  Array<{ id: string; name: string; code: string }>
> {
  const ctx = await requirePermission("report.view");

  const stores = await db
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      code: schema.stores.code,
    })
    .from(schema.stores)
    .where(and(eq(schema.stores.tenantId, ctx.tenantId), eq(schema.stores.isActive, true)))
    .orderBy(schema.stores.name);

  return stores;
}

export async function createTransferFromRedistributionAction(params: {
  fromStoreId: string;
  toStoreId: string;
  items: Array<{
    batchId: string;
    medicineId: string;
    batchNo: string;
    expiryDate: string;
    qty: number;
    unitCost: number;
    mrp: number;
    saleRate?: number;
  }>;
  notes?: string;
}): Promise<{ success: boolean; transferId: string; transferNo: string; error?: string }> {
  const ctx = await requirePermission("inventory.transfer");

  try {
    const result = await db.transaction(async (tx) => {
      const draft = await createRedistributionTransferDraft(tx, {
        tenantId: ctx.tenantId,
        fromStoreId: params.fromStoreId,
        toStoreId: params.toStoreId,
        items: params.items,
        createdBy: ctx.userId,
        notes: params.notes,
      });

      await writeAudit(
        tx,
        {
          tenantId: ctx.tenantId,
          storeId: params.fromStoreId,
          userId: ctx.userId,
        },
        {
          action: "create",
          entityType: "stock_transfer",
          entityId: draft.transferId,
          newValue: {
            transferNo: draft.transferNo,
            toStoreId: params.toStoreId,
            itemCount: params.items.length,
            trigger: "expiry_redistribution",
          },
        }
      );

      return draft;
    });

    revalidatePath("/dashboard/reports/expiry-redistribution");
    revalidatePath("/dashboard/inventory");

    return {
      success: true,
      transferId: result.transferId,
      transferNo: result.transferNo,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create transfer draft";
    return {
      success: false,
      transferId: "",
      transferNo: "",
      error: message,
    };
  }
}
