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
        // 1. Resolve or Create Medicine
        let medicineId: string;
        
        // Find existing medicine by exact name (case-insensitive)
        const [existingMed] = await tx
          .select({ id: schema.medicines.id })
          .from(schema.medicines)
          .where(
            and(
              eq(schema.medicines.tenantId, session.tenantId),
              sql`lower(${schema.medicines.name}) = lower(${row.medicineName})`
            )
          );

        if (existingMed) {
          medicineId = existingMed.id;
        } else {
          // Create new medicine
          // 1.5 Resolve Manufacturer and Category
          let manufacturerId: string | null = null;
          if (row.manufacturer && row.manufacturer !== "Unknown") {
            const [m] = await tx.select().from(schema.manufacturers)
              .where(and(eq(schema.manufacturers.tenantId, session.tenantId), sql`lower(${schema.manufacturers.name}) = lower(${row.manufacturer})`));
            if (m) {
              manufacturerId = m.id;
            } else {
              const [newM] = await tx.insert(schema.manufacturers)
                .values({ tenantId: session.tenantId, name: row.manufacturer })
                .returning({ id: schema.manufacturers.id });
              manufacturerId = newM.id;
            }
          }

          let categoryId: string | null = null;
          if (row.category && row.category !== "General") {
            const [c] = await tx.select().from(schema.categories)
              .where(and(eq(schema.categories.tenantId, session.tenantId), sql`lower(${schema.categories.name}) = lower(${row.category})`));
            if (c) {
              categoryId = c.id;
            } else {
              const [newC] = await tx.insert(schema.categories)
                .values({ tenantId: session.tenantId, name: row.category })
                .returning({ id: schema.categories.id });
              categoryId = newC.id;
            }
          }

          const [newMed] = await tx.insert(schema.medicines).values({
            tenantId: session.tenantId,
            name: row.medicineName,
            manufacturerId,
            categoryId,
            mrp: row.mrp,
            purchasePrice: row.purchaseRate,
            salePrice: row.saleRate,
          }).returning({ id: schema.medicines.id });
          medicineId = newMed.id;
        }

        // 2. Resolve or Create Batch
        let batchId: string;

        const [existingBatch] = await tx
          .select({ id: schema.batches.id, qtyOnHand: schema.batches.qtyOnHand })
          .from(schema.batches)
          .where(
            and(
              eq(schema.batches.storeId, session.storeId),
              eq(schema.batches.medicineId, medicineId),
              eq(schema.batches.batchNo, row.batchNo)
            )
          );

        if (existingBatch) {
          batchId = existingBatch.id;
          
          // Only add stock if quantity is provided
          if (row.qty > 0) {
            // Update physical stock through domain
            await recordStockMovement({
              tx,
              tenantId: session.tenantId,
              storeId: session.storeId,
              medicineId,
              batchId,
              type: "opening", // using opening balance for import
              qtyChange: row.qty,
              unitCost: row.purchaseRate,
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
            batchNo: row.batchNo,
            expiryDate: row.expiryDate,
            mfgDate: row.mfgDate || null,
            mrp: row.mrp,
            purchaseRate: row.purchaseRate,
            saleRate: row.saleRate,
            qtyOnHand: row.qty // Initial insert sets it directly
          }).returning({ id: schema.batches.id });
          
          batchId = newBatch.id;

          // Record initial ledger entry
          if (row.qty > 0) {
            await tx.insert(schema.stockMovements).values({
              tenantId: session.tenantId,
              storeId: session.storeId,
              medicineId,
              batchId,
              type: "opening",
              qtyChange: row.qty,
              balanceAfter: row.qty,
              unitCost: row.purchaseRate,
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
    return { success: true, count: importCount };
  } catch (error: any) {
    console.error("Import error:", error);
    return { error: error.message || "Failed to process import" };
  }
}
