import { and, asc, eq, gt, ilike, inArray, or } from "drizzle-orm";
import { format } from "date-fns";
import { schema, type DbOrTx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";

export interface PosSearchResultItem {
  medicine: typeof schema.medicines.$inferSelect & {
    rackCode: string | null;
    rackName: string | null;
  };
  batches: (typeof schema.batches.$inferSelect)[];
}

/**
 * High-performance POS medicine & in-stock batch search.
 * Leverages pg_trgm GIN indexes for fuzzy text lookup and partial index
 * `batches_store_med_active_idx` for active non-zero stock.
 */
export async function searchPosMedicines(
  database: DbOrTx,
  ctx: Pick<AuthCtx, "tenantId" | "storeId">,
  query: string,
  limit: number = 25,
): Promise<PosSearchResultItem[]> {
  const trimmed = query?.trim() ?? "";
  if (trimmed.length < 2) return [];

  const lowerQuery = trimmed.toLowerCase();
  const todayStr = format(new Date(), "yyyy-MM-dd");

  // 1. Find medicines matching query (by name, barcode, or generic composition)
  const medicines = await database
    .select({
      medicine: schema.medicines,
      rackCode: schema.racks.code,
      rackName: schema.racks.name,
      overridePrice: schema.storeMedicineSettings.salePriceOverride,
    })
    .from(schema.medicines)
    .leftJoin(
      schema.storeMedicineSettings,
      and(
        eq(schema.storeMedicineSettings.medicineId, schema.medicines.id),
        eq(schema.storeMedicineSettings.storeId, ctx.storeId),
        eq(schema.storeMedicineSettings.tenantId, ctx.tenantId),
      ),
    )
    .leftJoin(
      schema.racks,
      and(
        eq(schema.racks.id, schema.storeMedicineSettings.rackId),
        eq(schema.racks.storeId, ctx.storeId),
        eq(schema.racks.tenantId, ctx.tenantId),
      ),
    )
    .where(
      and(
        eq(schema.medicines.tenantId, ctx.tenantId),
        eq(schema.medicines.isActive, true),
        or(
          ilike(schema.medicines.name, `%${lowerQuery}%`),
          ilike(schema.medicines.barcode, `%${lowerQuery}%`),
          ilike(schema.medicines.genericName, `%${lowerQuery}%`),
        ),
      ),
    )
    .limit(limit);

  if (medicines.length === 0) return [];

  const medicineIds = medicines.map((m) => m.medicine.id);

  // 2. Fetch active non-expired batches for these candidate medicines
  // Hits the partial index: batches (store_id, medicine_id, expiry_date, id) WHERE qty_on_hand > 0
  const batches = await database
    .select()
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.storeId, ctx.storeId),
        eq(schema.batches.status, "active"),
        gt(schema.batches.qtyOnHand, 0),
        gt(schema.batches.expiryDate, todayStr),
        inArray(schema.batches.medicineId, medicineIds),
      ),
    )
    .orderBy(asc(schema.batches.expiryDate), asc(schema.batches.id));

  // 3. Collate batches under their corresponding medicine
  return medicines.map(({ medicine, rackCode, rackName, overridePrice }) => {
    const medBatches = batches.filter((b) => b.medicineId === medicine.id);
    return {
      medicine: {
        ...medicine,
        rackCode: rackCode ?? null,
        rackName: rackName ?? null,
        salePrice: overridePrice !== null && overridePrice !== undefined ? overridePrice : medicine.salePrice,
      },
      batches: medBatches,
    };
  });
}
