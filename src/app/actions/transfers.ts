"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gt, ilike, or } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requirePermission, can } from "@/server/rbac";
import { ForbiddenError } from "@/server/errors";
import {
  createDraftTransfer,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
  getTransferById,
  listTransfers,
  type CreateTransferInput,
  type DispatchTransferInput,
  type ReceiveTransferInput,
  type CancelTransferInput,
  type ListTransfersParams,
} from "@/server/domain/inventory/transfers";

export async function createDraftTransferAction(input: CreateTransferInput): Promise<
  | { success: true; transferId: string; transferNo: string }
  | { success: false; error: string }
> {
  try {
    const ctx = await requirePermission("inventory.transfer");
    const result = await createDraftTransfer(ctx, input);
    revalidatePath("/dashboard/inventory/transfers");
    return { success: true, transferId: result.transferId, transferNo: result.transferNo };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to create transfer" };
  }
}

export async function dispatchTransferAction(input: DispatchTransferInput) {
  try {
    const ctx = await requirePermission("inventory.transfer");
    const result = await dispatchTransfer(ctx, input);
    revalidatePath("/dashboard/inventory/transfers");
    revalidatePath(`/dashboard/inventory/transfers/${input.transferId}`);
    return { success: true, ...result };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to dispatch transfer" };
  }
}

export async function receiveTransferAction(input: ReceiveTransferInput) {
  try {
    const ctx = await requirePermission("inventory.view");
    if (!can(ctx, "inventory.transfer_receive") && !can(ctx, "inventory.transfer")) {
      throw new ForbiddenError("inventory.transfer_receive");
    }
    const result = await receiveTransfer(ctx, input);
    revalidatePath("/dashboard/inventory/transfers");
    revalidatePath(`/dashboard/inventory/transfers/${input.transferId}`);
    return { success: true, ...result };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to receive transfer" };
  }
}

export async function cancelTransferAction(input: CancelTransferInput) {
  try {
    const ctx = await requirePermission("inventory.transfer");
    const result = await cancelTransfer(ctx, input);
    revalidatePath("/dashboard/inventory/transfers");
    revalidatePath(`/dashboard/inventory/transfers/${input.transferId}`);
    return { success: true, ...result };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to cancel transfer" };
  }
}

export async function getTransferDetailsAction(transferId: string) {
  try {
    const ctx = await requirePermission("inventory.view");
    const transfer = await getTransferById(ctx.tenantId, transferId);
    return { success: true, transfer };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to get transfer details" };
  }
}

export async function listTransfersAction(params: ListTransfersParams = {}) {
  try {
    const ctx = await requirePermission("inventory.view");
    const transfers = await listTransfers(ctx.tenantId, params);
    return { success: true, transfers };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to list transfers" };
  }
}

export async function getTransferBatchesAction(storeId: string, search?: string) {
  try {
    const ctx = await requirePermission("inventory.view");
    const todayStr = new Date().toISOString().split("T")[0];

    const conditions = [
      eq(schema.batches.tenantId, ctx.tenantId),
      eq(schema.batches.storeId, storeId),
      gt(schema.batches.qtyOnHand, 0),
      gt(schema.batches.expiryDate, todayStr),
    ];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(schema.medicines.name, term),
          ilike(schema.batches.batchNo, term),
        )!,
      );
    }

    const batches = await db
      .select({
        id: schema.batches.id,
        medicineId: schema.batches.medicineId,
        medicineName: schema.medicines.name,
        batchNo: schema.batches.batchNo,
        expiryDate: schema.batches.expiryDate,
        qtyOnHand: schema.batches.qtyOnHand,
        unitCost: schema.batches.purchaseRate,
        mrp: schema.batches.mrp,
      })
      .from(schema.batches)
      .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
      .where(and(...conditions))
      .orderBy(schema.batches.expiryDate)
      .limit(50);

    return { success: true, batches };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to fetch batches" };
  }
}

export async function generateTransferEWayBillAction(
  transferId: string,
  transportDetails: {
    transporterId?: string;
    transporterName?: string;
    transportMode?: "1" | "2" | "3" | "4";
    vehicleNo?: string;
    distanceKm: number;
    vehicleType?: "R" | "O";
  }
) {
  try {
    const ctx = await requirePermission("inventory.transfer");
    const { generateEWayBillForTransfer } = await import("@/server/domain/transfers-eway");
    const result = await generateEWayBillForTransfer(db, {
      tenantId: ctx.tenantId,
      transferId,
      transportDetails,
    });
    revalidatePath("/dashboard/inventory/transfers");
    revalidatePath(`/dashboard/inventory/transfers/${transferId}`);
    revalidatePath("/dashboard/gst/e-way-bill");
    return result;
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to generate transfer E-Way Bill" };
  }
}
