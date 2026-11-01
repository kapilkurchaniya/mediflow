/**
 * Store-specific medicine settings domain service (Task A3.3 / Lane A).
 *
 * Provides resolution of effective per-branch inventory thresholds, rack assignments,
 * and selling price overrides, with pure inheritance from tenant-wide catalog defaults.
 *
 * Contract:
 * - Lane B Task B3.2 (Reorder engine) depends on `getStoreMedicineSettings`.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type DbOrTx } from "@/server/db";
import { assertPermission, type AuthCtx } from "@/server/rbac";
import { writeAudit } from "@/server/audit";
import { DomainError, NotFoundError } from "@/server/errors";

export interface EffectiveStoreMedicineSettings {
  tenantId: string;
  storeId: string;
  medicineId: string;
  reorderLevel: number;
  maxStock: number;
  rackId: string | null;
  rackCode: string | null;
  rackName: string | null;
  salePrice: number; // in paise
  salePriceSource: "store_override" | "catalog_default";
  hasStoreOverrides: boolean;
}

export const updateStoreMedicineSettingsSchema = z.object({
  reorderLevel: z.number().int().min(0, "Reorder level must be non-negative").nullable().optional(),
  maxStock: z.number().int().min(0, "Maximum stock must be non-negative").nullable().optional(),
  rackId: z.string().uuid("Invalid rack ID").nullable().optional(),
  salePriceOverride: z.number().int().min(0, "Selling price override must be non-negative").nullable().optional(),
});

export type UpdateStoreMedicineSettingsInput = z.infer<typeof updateStoreMedicineSettingsSchema>;

/**
 * Bulk resolves effective store-level medicine settings for a given store.
 * Falls back to tenant-level catalog defaults when no branch override exists.
 *
 * Contract for Lane B Task B3.2 (Reorder engine).
 */
export async function getStoreMedicineSettings(
  tx: DbOrTx,
  ctx: Pick<AuthCtx, "tenantId">,
  storeId: string,
  medicineIds: string[],
): Promise<Map<string, EffectiveStoreMedicineSettings>> {
  const result = new Map<string, EffectiveStoreMedicineSettings>();
  if (!medicineIds || medicineIds.length === 0) {
    return result;
  }

  const uniqueIds = Array.from(new Set(medicineIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return result;
  }

  const rows = await tx
    .select({
      medicineId: schema.medicines.id,
      tenantId: schema.medicines.tenantId,
      catalogReorderLevel: schema.medicines.reorderLevel,
      catalogMaxStock: schema.medicines.maxStock,
      catalogSalePrice: schema.medicines.salePrice,
      overrideReorderLevel: schema.storeMedicineSettings.reorderLevel,
      overrideMaxStock: schema.storeMedicineSettings.maxStock,
      overrideRackId: schema.storeMedicineSettings.rackId,
      overrideSalePrice: schema.storeMedicineSettings.salePriceOverride,
      rackId: schema.racks.id,
      rackCode: schema.racks.code,
      rackName: schema.racks.name,
    })
    .from(schema.medicines)
    .leftJoin(
      schema.storeMedicineSettings,
      and(
        eq(schema.storeMedicineSettings.medicineId, schema.medicines.id),
        eq(schema.storeMedicineSettings.storeId, storeId),
        eq(schema.storeMedicineSettings.tenantId, ctx.tenantId),
      ),
    )
    .leftJoin(
      schema.racks,
      and(
        eq(
          schema.racks.id,
          sql`COALESCE(${schema.storeMedicineSettings.rackId}, ${schema.medicines.rackId})`,
        ),
        eq(schema.racks.storeId, storeId),
        eq(schema.racks.tenantId, ctx.tenantId),
      ),
    )
    .where(
      and(
        eq(schema.medicines.tenantId, ctx.tenantId),
        inArray(schema.medicines.id, uniqueIds),
      ),
    );

  for (const row of rows) {
    const hasReorderOverride = row.overrideReorderLevel !== null && row.overrideReorderLevel !== undefined;
    const hasMaxStockOverride = row.overrideMaxStock !== null && row.overrideMaxStock !== undefined;
    const hasPriceOverride = row.overrideSalePrice !== null && row.overrideSalePrice !== undefined;
    const hasRackOverride = row.overrideRackId !== null && row.overrideRackId !== undefined;

    const reorderLevel = hasReorderOverride
      ? (row.overrideReorderLevel as number)
      : (row.catalogReorderLevel ?? 10);

    const maxStock = hasMaxStockOverride
      ? (row.overrideMaxStock as number)
      : (row.catalogMaxStock ?? 100);

    const salePrice = hasPriceOverride
      ? (row.overrideSalePrice as number)
      : (row.catalogSalePrice ?? 0);

    const salePriceSource = hasPriceOverride ? "store_override" : "catalog_default";

    // Resolved rack: if store override exists, use it (can be null). Otherwise, use joined rack id if it matches store.
    const rackId = hasRackOverride
      ? (row.overrideRackId as string)
      : (row.rackId ?? null);

    result.set(row.medicineId, {
      tenantId: row.tenantId,
      storeId,
      medicineId: row.medicineId,
      reorderLevel,
      maxStock,
      rackId,
      rackCode: row.rackCode ?? null,
      rackName: row.rackName ?? null,
      salePrice,
      salePriceSource,
      hasStoreOverrides: hasReorderOverride || hasMaxStockOverride || hasPriceOverride || hasRackOverride,
    });
  }

  return result;
}

/**
 * Updates or creates store-specific medicine settings for a specific branch.
 * Enforces store ownership, tenant isolation, rack store-scoping, and audit trail.
 */
export async function updateStoreMedicineSettings(
  tx: DbOrTx,
  ctx: AuthCtx,
  storeId: string,
  medicineId: string,
  input: UpdateStoreMedicineSettingsInput,
): Promise<EffectiveStoreMedicineSettings> {
  assertPermission(ctx, "medicine.manage");

  const parsed = updateStoreMedicineSettingsSchema.parse(input);

  // 1. Verify store exists and is active within caller tenant
  const [targetStore] = await tx
    .select({ id: schema.stores.id, isActive: schema.stores.isActive })
    .from(schema.stores)
    .where(and(eq(schema.stores.id, storeId), eq(schema.stores.tenantId, ctx.tenantId)));

  if (!targetStore) {
    throw new NotFoundError("Store not found.");
  }
  if (!targetStore.isActive) {
    throw new DomainError("STORE_INACTIVE", "Cannot modify settings for an inactive store.");
  }

  // 2. Verify medicine exists in caller tenant
  const [targetMedicine] = await tx
    .select({ id: schema.medicines.id })
    .from(schema.medicines)
    .where(and(eq(schema.medicines.id, medicineId), eq(schema.medicines.tenantId, ctx.tenantId)));

  if (!targetMedicine) {
    throw new NotFoundError("Medicine not found.");
  }

  // 3. If rackId is provided, verify rack belongs to caller tenant and target store
  if (parsed.rackId) {
    const [targetRack] = await tx
      .select({ id: schema.racks.id })
      .from(schema.racks)
      .where(
        and(
          eq(schema.racks.id, parsed.rackId),
          eq(schema.racks.tenantId, ctx.tenantId),
          eq(schema.racks.storeId, storeId),
        ),
      );

    if (!targetRack) {
      throw new NotFoundError("Rack not found.");
    }
  }

  // 4. Retrieve existing row for audit oldValue
  const [existingSettings] = await tx
    .select()
    .from(schema.storeMedicineSettings)
    .where(
      and(
        eq(schema.storeMedicineSettings.storeId, storeId),
        eq(schema.storeMedicineSettings.medicineId, medicineId),
        eq(schema.storeMedicineSettings.tenantId, ctx.tenantId),
      ),
    );

  // 5. Upsert settings row
  await tx
    .insert(schema.storeMedicineSettings)
    .values({
      tenantId: ctx.tenantId,
      storeId,
      medicineId,
      reorderLevel: parsed.reorderLevel,
      maxStock: parsed.maxStock,
      rackId: parsed.rackId,
      salePriceOverride: parsed.salePriceOverride,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.storeMedicineSettings.storeId, schema.storeMedicineSettings.medicineId],
      set: {
        ...(parsed.reorderLevel !== undefined ? { reorderLevel: parsed.reorderLevel } : {}),
        ...(parsed.maxStock !== undefined ? { maxStock: parsed.maxStock } : {}),
        ...(parsed.rackId !== undefined ? { rackId: parsed.rackId } : {}),
        ...(parsed.salePriceOverride !== undefined ? { salePriceOverride: parsed.salePriceOverride } : {}),
        updatedAt: new Date(),
      },
    });

  // 6. Write audit trail
  await writeAudit(tx, ctx, {
    action: "store_medicine_settings_update",
    entityType: "store_medicine_settings",
    entityId: `${storeId}:${medicineId}`,
    oldValue: existingSettings ? {
      reorderLevel: existingSettings.reorderLevel,
      maxStock: existingSettings.maxStock,
      rackId: existingSettings.rackId,
      salePriceOverride: existingSettings.salePriceOverride,
    } : null,
    newValue: parsed,
  });

  const resolvedMap = await getStoreMedicineSettings(tx, ctx, storeId, [medicineId]);
  const resolved = resolvedMap.get(medicineId);
  if (!resolved) {
    throw new DomainError("INTERNAL_ERROR", "Failed to resolve updated store settings.");
  }

  return resolved;
}
