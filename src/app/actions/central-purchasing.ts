"use server";

import { z } from "zod";
import { db, schema } from "@/server/db";
import { eq, and, inArray, ilike, or, desc, sql } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { protectedAction } from "@/server/action";
import { revalidatePath } from "next/cache";
import {
  CreateCentralSplitPoSchema,
  createMultiBranchSplitPo,
} from "@/server/domain/purchasing/central-po";

export interface CentralPurchasingSupplierOption {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  leadTimeDays: number;
}

export interface CentralPurchasingStoreOption {
  id: string;
  name: string;
  code: string;
}

export interface CentralPurchasingMedicineItem {
  id: string;
  name: string;
  genericName: string | null;
  packUnit: string;
  looseUnit: string;
  unitsPerPack: number;
  lastPurchaseRatePaise: number;
}

/**
 * Fetch initial bootstrap data for central purchasing page
 */
export async function getCentralPurchasingInitialDataAction(): Promise<{
  suppliers: CentralPurchasingSupplierOption[];
  stores: CentralPurchasingStoreOption[];
  medicines: CentralPurchasingMedicineItem[];
}> {
  const ctx = await requirePermission("purchase.view");

  // Suppliers
  const suppliers = await db
    .select({
      id: schema.suppliers.id,
      name: schema.suppliers.name,
      phone: schema.suppliers.phone,
      gstin: schema.suppliers.gstin,
      leadTimeDays: schema.suppliers.leadTimeDays,
    })
    .from(schema.suppliers)
    .where(
      and(
        eq(schema.suppliers.tenantId, ctx.tenantId),
        eq(schema.suppliers.isActive, true)
      )
    )
    .orderBy(schema.suppliers.name);

  // Stores
  const canViewAll =
    ctx.allowedStoreIds === "all" || ctx.permissions.has("report.all_stores");
  let stores: CentralPurchasingStoreOption[] = [];

  if (!canViewAll && Array.isArray(ctx.allowedStoreIds)) {
    stores = await db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        code: schema.stores.code,
      })
      .from(schema.stores)
      .where(
        and(
          eq(schema.stores.tenantId, ctx.tenantId),
          inArray(schema.stores.id, ctx.allowedStoreIds)
        )
      )
      .orderBy(schema.stores.name);
  } else if (!canViewAll) {
    stores = await db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        code: schema.stores.code,
      })
      .from(schema.stores)
      .where(
        and(
          eq(schema.stores.tenantId, ctx.tenantId),
          eq(schema.stores.id, ctx.storeId)
        )
      );
  } else {
    stores = await db
      .select({
        id: schema.stores.id,
        name: schema.stores.name,
        code: schema.stores.code,
      })
      .from(schema.stores)
      .where(eq(schema.stores.tenantId, ctx.tenantId))
      .orderBy(schema.stores.name);
  }

  // Initial medicines (top 50 active medicines)
  const meds = await db
    .select({
      id: schema.medicines.id,
      name: schema.medicines.name,
      genericName: schema.medicines.genericName,
      packUnit: schema.medicines.packUnit,
      looseUnit: schema.medicines.looseUnit,
      unitsPerPack: schema.medicines.unitsPerPack,
    })
    .from(schema.medicines)
    .where(
      and(
        eq(schema.medicines.tenantId, ctx.tenantId),
        eq(schema.medicines.isActive, true)
      )
    )
    .limit(50);

  const medicines: CentralPurchasingMedicineItem[] = meds.map((m) => ({
    id: m.id,
    name: m.name,
    genericName: m.genericName,
    packUnit: m.packUnit || "strip",
    looseUnit: m.looseUnit || "tablet",
    unitsPerPack: m.unitsPerPack || 1,
    lastPurchaseRatePaise: 0,
  }));

  return { suppliers, stores, medicines };
}

/**
 * Autocomplete search for medicines in tenant catalog
 */
export async function searchMedicinesForCentralPo(
  query: string
): Promise<CentralPurchasingMedicineItem[]> {
  const ctx = await requirePermission("purchase.view");
  if (!query || query.trim().length === 0) return [];

  const pattern = `%${query.trim()}%`;
  const meds = await db
    .select({
      id: schema.medicines.id,
      name: schema.medicines.name,
      genericName: schema.medicines.genericName,
      packUnit: schema.medicines.packUnit,
      looseUnit: schema.medicines.looseUnit,
      unitsPerPack: schema.medicines.unitsPerPack,
    })
    .from(schema.medicines)
    .where(
      and(
        eq(schema.medicines.tenantId, ctx.tenantId),
        eq(schema.medicines.isActive, true),
        or(
          ilike(schema.medicines.name, pattern),
          ilike(schema.medicines.genericName, pattern)
        )
      )
    )
    .limit(20);

  return meds.map((m) => ({
    id: m.id,
    name: m.name,
    genericName: m.genericName,
    packUnit: m.packUnit || "strip",
    looseUnit: m.looseUnit || "tablet",
    unitsPerPack: m.unitsPerPack || 1,
    lastPurchaseRatePaise: 0,
  }));
}

/**
 * Server action to generate split purchase orders across multiple branch destinations
 */
export const createCentralSplitPoAction = protectedAction("purchase.create")
  .schema(CreateCentralSplitPoSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await db.transaction(async (tx) => {
      return createMultiBranchSplitPo(tx, ctx, parsedInput);
    });

    revalidatePath("/dashboard/purchases/orders");
    revalidatePath("/dashboard/purchases/orders/central");
    return result;
  });

