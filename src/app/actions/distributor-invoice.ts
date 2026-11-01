"use server";

import { db } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import {
  parseDistributorInvoice,
  quickCreateDistributorMedicines,
  type ParseDistributorInvoiceResult,
} from "@/server/domain/import/distributor-invoice";
import type { GstRateBp } from "@/lib/regulatory";

/**
 * Server action to parse a distributor electronic bill (Pharmarack, Retailio, Marg CSV),
 * detect columns, match against catalog, and compute landed unit costs.
 */
export async function parseDistributorInvoiceAction(
  csvContent: string
): Promise<{ success: boolean; result?: ParseDistributorInvoiceResult; error?: string }> {
  try {
    const ctx = await requirePermission("purchase.create");

    if (!csvContent || csvContent.trim().length === 0) {
      return { success: false, error: "CSV content is empty." };
    }

    const result = await parseDistributorInvoice(csvContent, {
      db,
      tenantId: ctx.tenantId,
    });

    return { success: true, result };
  } catch (err: unknown) {
    console.error("[parseDistributorInvoiceAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse distributor invoice.",
    };
  }
}

/**
 * Server action to quick-create minimal medicine master entries for items
 * in the distributor bill that do not yet exist in the store catalog.
 */
export async function quickCreateDistributorMedicinesAction(
  items: {
    name: string;
    pack?: string;
    unitsPerPack?: number;
    hsn?: string;
    gstRateBp?: GstRateBp;
    mrpPaise?: number;
    ptrPaise?: number;
    barcode?: string | null;
  }[]
): Promise<{ success: boolean; createdMap?: Record<string, string>; error?: string }> {
  try {
    const ctx = await requirePermission("purchase.create");

    if (!items || items.length === 0) {
      return { success: true, createdMap: {} };
    }

    const createdMap = await quickCreateDistributorMedicines(db, ctx.tenantId, items);

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/purchases/new");

    // Convert Map to plain object for Server Action serializability
    const mapObj: Record<string, string> = {};
    for (const [k, v] of createdMap.entries()) {
      mapObj[k] = v;
    }

    return { success: true, createdMap: mapObj };
  } catch (err: unknown) {
    console.error("[quickCreateDistributorMedicinesAction] Error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create missing medicines.",
    };
  }
}
