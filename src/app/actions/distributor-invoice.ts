"use server";

import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import {
  parseDistributorInvoice,
  quickCreateDistributorMedicines,
  type ParseDistributorInvoiceResult,
} from "@/server/domain/import/distributor-invoice";
import {
  evaluateGrnSupplierMatch,
  type SupplierCheckResult,
} from "@/server/domain/import/supplier-matcher";
import { PENDING_SUPPLIER_PLACEHOLDER_NAME } from "@/lib/pending-supplier";
import type { GstRateBp } from "@/lib/regulatory";

/**
 * Server action to parse a distributor electronic bill (Pharmarack, Retailio, Marg CSV),
 * detect columns, match against catalog, and compute landed unit costs.
 */
export async function parseDistributorInvoiceAction(
  csvContent: string,
  selectedSupplierId?: string | null
): Promise<{
  success: boolean;
  result?: ParseDistributorInvoiceResult;
  header?: { invoiceNo?: string; invoiceDate?: string };
  supplierCheck?: SupplierCheckResult | null;
  error?: string;
}> {
  try {
    const ctx = await requirePermission("purchase.create");

    if (!csvContent || csvContent.trim().length === 0) {
      return { success: false, error: "CSV content is empty." };
    }

    const result = await parseDistributorInvoice(csvContent, {
      db,
      tenantId: ctx.tenantId,
    });

    let supplierCheck: SupplierCheckResult | null = null;
    if (result.extractedSupplier) {
      const suppliers = await db
        .select({
          id: schema.suppliers.id,
          name: schema.suppliers.name,
          gstin: schema.suppliers.gstin,
          phone: schema.suppliers.phone,
          drugLicenseNo: schema.suppliers.drugLicenseNo,
        })
        .from(schema.suppliers)
        .where(and(eq(schema.suppliers.tenantId, ctx.tenantId), eq(schema.suppliers.isActive, true)));

      const visibleSuppliers = suppliers.filter((s) => s.name !== PENDING_SUPPLIER_PLACEHOLDER_NAME);
      supplierCheck = evaluateGrnSupplierMatch({
        selectedSupplierId: selectedSupplierId || null,
        suppliers: visibleSuppliers,
        extracted: result.extractedSupplier,
      });
    }

    return {
      success: true,
      result,
      header: result.header,
      supplierCheck,
    };
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
