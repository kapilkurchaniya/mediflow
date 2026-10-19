"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { calculateBestScheme, evaluateSchemeBenefit } from "@/server/domain/schemes";

export async function getSchemes() {
  const { session } = await requireAuth();

  const list = await db
    .select({
      scheme: schema.schemes,
      medicineName: schema.medicines.name,
      supplierName: schema.suppliers.name,
      categoryName: schema.categories.name,
    })
    .from(schema.schemes)
    .leftJoin(schema.medicines, eq(schema.schemes.medicineId, schema.medicines.id))
    .leftJoin(schema.suppliers, eq(schema.schemes.supplierId, schema.suppliers.id))
    .leftJoin(schema.categories, eq(schema.schemes.categoryId, schema.categories.id))
    .where(eq(schema.schemes.tenantId, session.tenantId))
    .orderBy(desc(schema.schemes.createdAt));

  return list;
}

export async function createScheme(data: {
  name: string;
  schemeType: "free_qty" | "percentage" | "flat" | "tiered";
  supplierId?: string | null;
  medicineId?: string | null;
  categoryId?: string | null;
  buyQty?: number;
  freeQty?: number;
  discountBp?: number;
  flatDiscount?: number;
  minQty?: number;
  validFrom?: string | null;
  validTo?: string | null;
}) {
  const { session } = await requireAuth();

  if (!data.name?.trim()) return { error: "Scheme name is required" };

  try {
    const [scheme] = await db
      .insert(schema.schemes)
      .values({
        tenantId: session.tenantId,
        storeId: session.storeId,
        name: data.name.trim(),
        schemeType: data.schemeType,
        supplierId: data.supplierId?.trim() || null,
        medicineId: data.medicineId?.trim() || null,
        categoryId: data.categoryId?.trim() || null,
        buyQty: data.buyQty || 0,
        freeQty: data.freeQty || 0,
        discountBp: data.discountBp || 0,
        flatDiscount: data.flatDiscount || 0,
        minQty: data.minQty && data.minQty > 0 ? data.minQty : 1,
        validFrom: data.validFrom || null,
        validTo: data.validTo || null,
        isActive: true,
      })
      .returning();

    revalidatePath("/dashboard/settings/schemes");
    revalidatePath("/dashboard/sales/pos");
    revalidatePath("/dashboard/purchases");
    return { success: true, scheme };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function toggleSchemeStatus(id: string, isActive: boolean) {
  const { session } = await requireAuth();

  await db
    .update(schema.schemes)
    .set({ isActive })
    .where(and(eq(schema.schemes.id, id), eq(schema.schemes.tenantId, session.tenantId)));

  revalidatePath("/dashboard/settings/schemes");
  return { success: true };
}

export async function deleteScheme(id: string) {
  const { session } = await requireAuth();

  await db
    .delete(schema.schemes)
    .where(and(eq(schema.schemes.id, id), eq(schema.schemes.tenantId, session.tenantId)));

  revalidatePath("/dashboard/settings/schemes");
  return { success: true };
}

/**
 * Quick client-callable check to get any applicable scheme for an item in POS or GRN.
 */
export async function checkItemScheme(params: {
  medicineId: string;
  qty: number;
  unitPricePaise: number;
  supplierId?: string;
}) {
  const { session } = await requireAuth();

  const [med] = await db
    .select({ categoryId: schema.medicines.categoryId })
    .from(schema.medicines)
    .where(eq(schema.medicines.id, params.medicineId));

  const bestScheme = await calculateBestScheme(db, {
    tenantId: session.tenantId,
    storeId: session.storeId,
    medicineId: params.medicineId,
    categoryId: med?.categoryId,
    supplierId: params.supplierId,
    qty: params.qty,
    unitPricePaise: params.unitPricePaise,
  });

  return bestScheme;
}
