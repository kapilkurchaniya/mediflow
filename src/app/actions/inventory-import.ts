"use server";

import { db, schema } from "@/server/db";
import { eq, and, sql } from "drizzle-orm";
import { getCurrentSession, requireAuth } from "@/server/auth";
import { recordStockMovement } from "@/server/domain/stock";
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
};

export async function processInventoryImport(rows: ImportRow[]) {
  const { session, user } = await requireAuth();

  if (!rows || rows.length === 0) return { error: "No data to import" };

  try {
    const importCount = await db.transaction(async (tx) => {
      let processed = 0;

      for (const row of rows) {
        if (!row.medicineName || !row.medicineName.trim()) continue;

        // Sanitize all numeric fields to prevent NaN, null, or negative values from failing Postgres queries
        const cleanMrp = Number.isFinite(row.mrp) && row.mrp >= 0 ? Math.round(row.mrp) : 0;
        let cleanPurchaseRate = Number.isFinite(row.purchaseRate) && row.purchaseRate >= 0 ? Math.round(row.purchaseRate) : 0;
        // If purchase rate was not provided or 0, fallback to standard Indian pharma PTR (80% of MRP)
        if (cleanPurchaseRate === 0 && cleanMrp > 0) {
          cleanPurchaseRate = Math.round(cleanMrp * 0.8);
        }
        const cleanSaleRate = Number.isFinite(row.saleRate) && row.saleRate > 0 ? Math.round(row.saleRate) : cleanMrp;
        const cleanQty = Number.isFinite(row.qty) && row.qty >= 0 ? Math.round(row.qty) : 0;

        // 1. Resolve or Create Medicine
        let medicineId: string;
        
        // Find existing medicine by exact name (case-insensitive)
        const [existingMed] = await tx
          .select({ id: schema.medicines.id })
          .from(schema.medicines)
          .where(
            and(
              eq(schema.medicines.tenantId, session.tenantId),
              sql`lower(${schema.medicines.name}) = lower(${row.medicineName.trim()})`
            )
          );

        if (existingMed) {
          medicineId = existingMed.id;
        } else {
          // Create new medicine
          // 1.5 Resolve Manufacturer and Category
          let manufacturerId: string | null = null;
          if (row.manufacturer && row.manufacturer !== "Unknown" && row.manufacturer.trim().length > 0) {
            const trimmedMfg = row.manufacturer.trim();
            const [m] = await tx.select().from(schema.manufacturers)
              .where(and(eq(schema.manufacturers.tenantId, session.tenantId), sql`lower(${schema.manufacturers.name}) = lower(${trimmedMfg})`));
            if (m) {
              manufacturerId = m.id;
            } else {
              const [newM] = await tx.insert(schema.manufacturers)
                .values({ tenantId: session.tenantId, name: trimmedMfg })
                .returning({ id: schema.manufacturers.id });
              manufacturerId = newM.id;
            }
          }

          let categoryId: string | null = null;
          if (row.category && row.category !== "General" && row.category.trim().length > 0) {
            const trimmedCat = row.category.trim();
            const [c] = await tx.select().from(schema.categories)
              .where(and(eq(schema.categories.tenantId, session.tenantId), sql`lower(${schema.categories.name}) = lower(${trimmedCat})`));
            if (c) {
              categoryId = c.id;
            } else {
              const [newC] = await tx.insert(schema.categories)
                .values({ tenantId: session.tenantId, name: trimmedCat })
                .returning({ id: schema.categories.id });
              categoryId = newC.id;
            }
          }

          const [newMed] = await tx.insert(schema.medicines).values({
            tenantId: session.tenantId,
            name: row.medicineName.trim(),
            manufacturerId,
            categoryId,
            mrp: cleanMrp,
            purchasePrice: cleanPurchaseRate,
            salePrice: cleanSaleRate,
          }).returning({ id: schema.medicines.id });
          medicineId = newMed.id;
        }

        // 2. Resolve or Create Batch
        let batchId: string;
        const cleanBatchNo = (row.batchNo || "DEFAULT").trim();

        const [existingBatch] = await tx
          .select({ id: schema.batches.id, qtyOnHand: schema.batches.qtyOnHand })
          .from(schema.batches)
          .where(
            and(
              eq(schema.batches.storeId, session.storeId),
              eq(schema.batches.medicineId, medicineId),
              eq(schema.batches.batchNo, cleanBatchNo)
            )
          );

        if (existingBatch) {
          batchId = existingBatch.id;
          
          // Only add stock if quantity is provided
          if (cleanQty > 0) {
            // Update physical stock through domain
            await recordStockMovement({
              tx,
              tenantId: session.tenantId,
              storeId: session.storeId,
              medicineId,
              batchId,
              type: "opening", // using opening balance for import
              qtyChange: cleanQty,
              unitCost: cleanPurchaseRate,
              note: "Bulk CSV Import",
              userId: user.id
            });
          }
        } else {
          // Create new batch
          const [newBatch] = await tx.insert(schema.batches).values({
            tenantId: session.tenantId,
            storeId: session.storeId,
            medicineId,
            batchNo: cleanBatchNo,
            expiryDate: row.expiryDate,
            mfgDate: row.mfgDate || null,
            mrp: cleanMrp,
            purchaseRate: cleanPurchaseRate,
            saleRate: cleanSaleRate,
            qtyOnHand: cleanQty // Initial insert sets it directly
          }).returning({ id: schema.batches.id });
          
          batchId = newBatch.id;

          // Record initial ledger entry
          if (cleanQty > 0) {
            await tx.insert(schema.stockMovements).values({
              tenantId: session.tenantId,
              storeId: session.storeId,
              medicineId,
              batchId,
              type: "opening",
              qtyChange: cleanQty,
              balanceAfter: cleanQty,
              unitCost: cleanPurchaseRate,
              note: "Bulk CSV Import Initial Stock",
              userId: user.id
            });
          }
        }

        processed++;
      }

      return processed;
    });

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/batches");
    revalidatePath("/dashboard/inventory", "layout");
    revalidatePath("/dashboard");
    return { success: true, count: importCount };
  } catch (error: unknown) {
    console.error("Import error:", error);
    return { error: (error instanceof Error ? error.message : String(error)) || "Failed to process import" };
  }
}
