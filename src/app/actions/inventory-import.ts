"use server";

import { db, schema } from "@/server/db";
import { eq, and, sql } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { recordStockMovement } from "@/server/domain/stock";
import { writeAudit } from "@/server/audit";
import { revalidatePath } from "next/cache";

export type ImportRow = {
  medicineName: string;
  manufacturer?: string;
  category?: string;
  batchNo: string;
  expiryDate: string; // YYYY-MM-DD
  mfgDate?: string; // YYYY-MM-DD
  qty: number;
  mrp: number; // in paise
  purchaseRate: number; // in paise
  saleRate: number; // in paise
  unitsPerPack?: number;
  packSize?: string;
  packUnit?: string;
  looseUnit?: string;
};

export async function processInventoryImport(rows: ImportRow[]) {
  const ctx = await requirePermission("inventory.adjust");

  if (!rows || rows.length === 0) return { error: "No data to import" };

  try {
    const importCount = await db.transaction(async (tx) => {
      let processed = 0;

      for (const row of rows) {
        if (!row.medicineName || !row.medicineName.trim()) continue;

        const cleanMrp = Number.isFinite(row.mrp) && row.mrp >= 0 ? Math.round(row.mrp) : 0;
        let cleanPurchaseRate =
          Number.isFinite(row.purchaseRate) && row.purchaseRate >= 0 ? Math.round(row.purchaseRate) : 0;
        if (cleanPurchaseRate === 0 && cleanMrp > 0) {
          cleanPurchaseRate = Math.round(cleanMrp * 0.8);
        }
        const cleanSaleRate =
          Number.isFinite(row.saleRate) && row.saleRate > 0 ? Math.round(row.saleRate) : cleanMrp;
        const cleanQty = Number.isFinite(row.qty) && row.qty >= 0 ? Math.round(row.qty) : 0;

        // 1. Resolve or Create Medicine
        let medicineId: string;
        const [existingMed] = await tx
          .select({ id: schema.medicines.id })
          .from(schema.medicines)
          .where(
            and(
              eq(schema.medicines.tenantId, ctx.tenantId),
              sql`lower(${schema.medicines.name}) = lower(${row.medicineName.trim()})`
            )
          );

        if (existingMed) {
          medicineId = existingMed.id;
        } else {
          let manufacturerId: string | null = null;
          if (row.manufacturer && row.manufacturer !== "Unknown" && row.manufacturer.trim().length > 0) {
            const trimmedMfg = row.manufacturer.trim();
            const [m] = await tx
              .select({ id: schema.manufacturers.id })
              .from(schema.manufacturers)
              .where(
                and(
                  eq(schema.manufacturers.tenantId, ctx.tenantId),
                  sql`lower(${schema.manufacturers.name}) = lower(${trimmedMfg})`
                )
              );
            if (m) {
              manufacturerId = m.id;
            } else {
              const [newM] = await tx
                .insert(schema.manufacturers)
                .values({ tenantId: ctx.tenantId, name: trimmedMfg })
                .returning({ id: schema.manufacturers.id });
              manufacturerId = newM.id;
            }
          }

          let categoryId: string | null = null;
          if (row.category && row.category !== "General" && row.category.trim().length > 0) {
            const trimmedCat = row.category.trim();
            const [c] = await tx
              .select({ id: schema.categories.id })
              .from(schema.categories)
              .where(
                and(
                  eq(schema.categories.tenantId, ctx.tenantId),
                  sql`lower(${schema.categories.name}) = lower(${trimmedCat})`
                )
              );
            if (c) {
              categoryId = c.id;
            } else {
              const [newC] = await tx
                .insert(schema.categories)
                .values({ tenantId: ctx.tenantId, name: trimmedCat })
                .returning({ id: schema.categories.id });
              categoryId = newC.id;
            }
          }

          const [newMed] = await tx
            .insert(schema.medicines)
            .values({
              tenantId: ctx.tenantId,
              name: row.medicineName.trim(),
              manufacturerId,
              categoryId,
              mrp: cleanMrp,
              purchasePrice: cleanPurchaseRate,
              salePrice: cleanSaleRate,
              ...(row.unitsPerPack && row.unitsPerPack > 1
                ? {
                    unitsPerPack: Math.round(row.unitsPerPack),
                    packUnit: row.packUnit || "strip",
                    looseUnit: row.looseUnit || "tablet",
                  }
                : {}),
              ...(row.packSize ? { packSize: row.packSize.trim() } : {}),
            })
            .returning({ id: schema.medicines.id });
          medicineId = newMed.id;
        }

        // 2. Resolve or Create Batch (uppercase normalized)
        const cleanBatchNo = (row.batchNo || "DEFAULT").trim().toUpperCase();
        const [existingBatch] = await tx
          .select({ id: schema.batches.id })
          .from(schema.batches)
          .where(
            and(
              eq(schema.batches.storeId, ctx.storeId),
              eq(schema.batches.medicineId, medicineId),
              eq(schema.batches.batchNo, cleanBatchNo)
            )
          );

        let batchId: string;
        if (existingBatch) {
          batchId = existingBatch.id;
        } else {
          const [newBatch] = await tx
            .insert(schema.batches)
            .values({
              tenantId: ctx.tenantId,
              storeId: ctx.storeId,
              medicineId,
              batchNo: cleanBatchNo,
              expiryDate: row.expiryDate,
              mfgDate: row.mfgDate || null,
              mrp: cleanMrp,
              purchaseRate: cleanPurchaseRate,
              saleRate: cleanSaleRate,
              qtyOnHand: 0,
            })
            .returning({ id: schema.batches.id });
          batchId = newBatch.id;
        }

        if (cleanQty > 0) {
          await recordStockMovement({
            tx,
            tenantId: ctx.tenantId,
            storeId: ctx.storeId,
            medicineId,
            batchId,
            type: "opening",
            qtyChange: cleanQty,
            unitCost: cleanPurchaseRate,
            note: existingBatch ? "Quick CSV Import (added)" : "Quick CSV Import (opening)",
            userId: ctx.userId,
          });
        }

        processed++;
      }

      await writeAudit(tx, ctx, {
        action: "stock_adjust",
        entityType: "batch",
        newValue: { rowCount: processed, source: "quick_csv_import" },
      });

      return processed;
    });

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/batches");
    revalidatePath("/dashboard/inventory", "layout");
    revalidatePath("/dashboard");
    return { success: true, count: importCount };
  } catch (error: unknown) {
    console.error("Import error:", error);
    return {
      error: (error instanceof Error ? error.message : String(error)) || "Failed to process import",
    };
  }
}
