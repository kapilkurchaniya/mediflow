import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { schema } from "@/server/db";

export function normalizeDistributorItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function lookupSupplierItemMaps(
  db: DbOrTx,
  params: {
    tenantId: string;
    supplierId?: string | null;
    itemNames: string[];
  },
): Promise<Map<string, { medicineId: string; lastPurchaseRate: number | null }>> {
  const normalized = [...new Set(params.itemNames.map(normalizeDistributorItemName).filter(Boolean))];
  const map = new Map<string, { medicineId: string; lastPurchaseRate: number | null }>();
  if (normalized.length === 0) return map;

  const supplierCond = params.supplierId
    ? or(eq(schema.supplierItemMap.supplierId, params.supplierId), isNull(schema.supplierItemMap.supplierId))
    : isNull(schema.supplierItemMap.supplierId);

  const rows = await db
    .select({
      supplierId: schema.supplierItemMap.supplierId,
      normalizedName: schema.supplierItemMap.normalizedName,
      medicineId: schema.supplierItemMap.medicineId,
      lastPurchaseRate: schema.supplierItemMap.lastPurchaseRate,
    })
    .from(schema.supplierItemMap)
    .where(
      and(
        eq(schema.supplierItemMap.tenantId, params.tenantId),
        supplierCond,
        inArray(schema.supplierItemMap.normalizedName, normalized),
      ),
    );

  // Prefer supplier-specific match over tenant-wide fallback
  for (const r of rows) {
    if (!r.supplierId && !map.has(r.normalizedName)) {
      map.set(r.normalizedName, { medicineId: r.medicineId, lastPurchaseRate: r.lastPurchaseRate });
    }
  }
  for (const r of rows) {
    if (r.supplierId) {
      map.set(r.normalizedName, { medicineId: r.medicineId, lastPurchaseRate: r.lastPurchaseRate });
    }
  }

  return map;
}

export async function upsertSupplierItemMap(
  db: DbOrTx,
  params: {
    tenantId: string;
    supplierId?: string | null;
    externalItemCode?: string | null;
    externalItemName: string;
    medicineId: string;
    lastPurchaseRate?: number | null;
  },
): Promise<void> {
  const normalizedName = normalizeDistributorItemName(params.externalItemName);
  if (!normalizedName) return;

  await db
    .insert(schema.supplierItemMap)
    .values({
      tenantId: params.tenantId,
      supplierId: params.supplierId ?? null,
      externalItemCode: params.externalItemCode ?? null,
      externalItemName: params.externalItemName.trim(),
      normalizedName,
      medicineId: params.medicineId,
      lastPurchaseRate: params.lastPurchaseRate ?? 0,
    })
    .onConflictDoUpdate({
      target: [schema.supplierItemMap.tenantId, schema.supplierItemMap.supplierId, schema.supplierItemMap.normalizedName],
      set: {
        medicineId: params.medicineId,
        lastPurchaseRate: params.lastPurchaseRate ?? undefined,
        useCount: sql`${schema.supplierItemMap.useCount} + 1`,
        updatedAt: new Date(),
      },
    });
}
