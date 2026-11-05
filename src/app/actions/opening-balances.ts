"use server";

import { db } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import {
  customerOpeningSchema,
  supplierOpeningSchema,
  inventorySnapshotSchema,
  reclassifyEquitySchema,
  postCustomerOpeningBalance,
  postSupplierOpeningBalance,
  captureOpeningInventorySnapshot,
  postInventorySnapshotJournal,
  reclassifyOpeningBalanceEquity,
  getOpeningBalancesSummary,
  getPartyOpeningBalances,
} from "@/server/domain/accounting-opening-balances";

export async function getOpeningBalancesSummaryAction() {
  const ctx = await requirePermission("accounting.view");
  return getOpeningBalancesSummary(ctx.tenantId);
}

export async function getPartyOpeningBalancesAction(partyType: "customer" | "supplier") {
  const ctx = await requirePermission("accounting.view");
  return getPartyOpeningBalances(ctx.tenantId, partyType);
}

export async function postCustomerOpeningBalanceAction(rawInput: unknown) {
  const ctx = await requirePermission("accounting.post");
  const parsed = customerOpeningSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    const result = await db.transaction(async (tx) => {
      return postCustomerOpeningBalance(tx, {
        tenantId: ctx.tenantId,
        storeId: parsed.data.storeId || ctx.storeId || undefined,
        customerId: parsed.data.customerId,
        amountPaise: parsed.data.amountPaise,
        asOfDate: parsed.data.asOfDate,
        userId: ctx.userId,
      });
    });

    revalidatePath("/dashboard/accounting/opening-balances");
    revalidatePath("/dashboard/accounting/trial-balance");
    revalidatePath("/dashboard/accounting/ledger");
    return { success: true, result };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to post customer opening balance" };
  }
}

export async function postSupplierOpeningBalanceAction(rawInput: unknown) {
  const ctx = await requirePermission("accounting.post");
  const parsed = supplierOpeningSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    const result = await db.transaction(async (tx) => {
      return postSupplierOpeningBalance(tx, {
        tenantId: ctx.tenantId,
        storeId: parsed.data.storeId || ctx.storeId || undefined,
        supplierId: parsed.data.supplierId,
        amountPaise: parsed.data.amountPaise,
        asOfDate: parsed.data.asOfDate,
        userId: ctx.userId,
      });
    });

    revalidatePath("/dashboard/accounting/opening-balances");
    revalidatePath("/dashboard/accounting/trial-balance");
    revalidatePath("/dashboard/accounting/ledger");
    return { success: true, result };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to post supplier opening balance" };
  }
}

export async function captureAndPostInventorySnapshotAction(rawInput: unknown) {
  const ctx = await requirePermission("accounting.post");
  const parsed = inventorySnapshotSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const snapRes = await captureOpeningInventorySnapshot(tx, {
        tenantId: ctx.tenantId,
        storeId: parsed.data.storeId,
        asOfDate: parsed.data.asOfDate,
        userId: ctx.userId,
      });

      if (snapRes.totalValuePaise <= 0) {
        throw new Error("No opening stock movements found for this store to capture as snapshot");
      }

      return postInventorySnapshotJournal(tx, {
        tenantId: ctx.tenantId,
        snapshotId: snapRes.snapshotId,
        userId: ctx.userId,
      });
    });

    revalidatePath("/dashboard/accounting/opening-balances");
    revalidatePath("/dashboard/accounting/trial-balance");
    revalidatePath("/dashboard/accounting/ledger");
    return { success: true, result };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to capture and post inventory snapshot" };
  }
}

export async function reclassifyOpeningEquityAction(rawInput: unknown) {
  const ctx = await requirePermission("accounting.post");
  const isOwner = ctx.permissions.has("accounting.period.lock");
  if (!isOwner) {
    return { error: "Reclassifying Opening Balance Equity is restricted to organization owners" };
  }

  const parsed = reclassifyEquitySchema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    const result = await db.transaction(async (tx) => {
      return reclassifyOpeningBalanceEquity(tx, {
        tenantId: ctx.tenantId,
        storeId: parsed.data.storeId || ctx.storeId || undefined,
        targetAccountId: parsed.data.targetAccountId,
        entryDate: parsed.data.entryDate,
        reason: parsed.data.reason,
        userId: ctx.userId,
      });
    });

    revalidatePath("/dashboard/accounting/opening-balances");
    revalidatePath("/dashboard/accounting/trial-balance");
    revalidatePath("/dashboard/accounting/ledger");
    return { success: true, result };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to reclassify opening balance equity" };
  }
}
