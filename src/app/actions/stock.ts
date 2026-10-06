"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql, lte } from "drizzle-orm";
import { getCurrentSession, requireAuth } from "@/server/auth";
import { recordStockMovement } from "@/server/domain/stock";
import { revalidatePath } from "next/cache";
import { addDays, format } from "date-fns";

export async function getBatches(nearExpiryOnly = false) {
  const { session, user } = await requireAuth();

  const ninetyDaysFromNow = nearExpiryOnly ? format(addDays(new Date(), 90), "yyyy-MM-dd") : undefined;

  const query = db
    .select({
      batch: schema.batches,
      medicine: schema.medicines,
    })
    .from(schema.batches)
    .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
    .where(
      and(
        eq(schema.batches.tenantId, session.tenantId),
        eq(schema.batches.storeId, session.storeId),
        nearExpiryOnly ? lte(schema.batches.expiryDate, ninetyDaysFromNow!) : undefined
      )
    );

  const results = await query.orderBy(schema.batches.expiryDate);
  return results;
}

export async function addOpeningStock(formData: FormData) {
  const { session, user } = await requireAuth();

  const medicineId = formData.get("medicineId") as string;
  const batchNo = formData.get("batchNo") as string;
  const expiryDate = formData.get("expiryDate") as string; // YYYY-MM-DD
  
  const qtyStr = formData.get("qty") as string;
  const purchaseRateStr = formData.get("purchaseRate") as string;
  const mrpStr = formData.get("mrp") as string;
  const saleRateStr = formData.get("saleRate") as string;

  if (!medicineId || !batchNo || !expiryDate || !qtyStr) {
    return { error: "Missing required fields" };
  }

  const qty = parseInt(qtyStr, 10);
  if (qty <= 0) return { error: "Quantity must be greater than 0" };

  const purchaseRate = purchaseRateStr ? Math.round(parseFloat(purchaseRateStr) * 100) : 0;
  const mrp = mrpStr ? Math.round(parseFloat(mrpStr) * 100) : 0;
  const saleRate = saleRateStr ? Math.round(parseFloat(saleRateStr) * 100) : mrp;

  try {
    await db.transaction(async (tx) => {
      // Check if batch already exists
      const existingBatch = await tx
        .select()
        .from(schema.batches)
        .where(
          and(
            eq(schema.batches.storeId, session.storeId),
            eq(schema.batches.medicineId, medicineId),
            eq(schema.batches.batchNo, batchNo)
          )
        )
        .limit(1);

      let batchId = "";

      if (existingBatch.length > 0) {
        batchId = existingBatch[0].id;
        // Batch exists, just add stock to it via movement
      } else {
        // Create new batch with 0 qty first, then add stock
        const [newBatch] = await tx
          .insert(schema.batches)
          .values({
            tenantId: session.tenantId,
            storeId: session.storeId,
            medicineId,
            batchNo,
            expiryDate,
            purchaseRate,
            mrp,
            saleRate,
            qtyOnHand: 0,
            status: "active",
          })
          .returning({ id: schema.batches.id });
        
        batchId = newBatch.id;
      }

      // Record the immutable stock movement
      await recordStockMovement({
        tx,
        tenantId: session.tenantId,
        storeId: session.storeId,
        batchId,
        medicineId,
        type: "opening",
        qtyChange: qty,
        unitCost: purchaseRate,
        note: "Opening stock entry",
        userId: user.id,
      });
    });

    revalidatePath("/dashboard/inventory/batches");
    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Failed to add opening stock" };
  }
}

export async function adjustBatchStock(formData: FormData) {
  const { session, user } = await requireAuth();

  const batchId = formData.get("batchId") as string;
  const qtyChangeStr = formData.get("qtyChange") as string;
  const reason = formData.get("reason") as "damage" | "expired" | "adjustment";
  const note = formData.get("note") as string;

  if (!batchId || !qtyChangeStr || !reason) {
    return { error: "Missing required fields" };
  }

  const qtyChange = parseInt(qtyChangeStr, 10);
  if (qtyChange === 0) {
    return { error: "Quantity change cannot be 0" };
  }

  try {
    await db.transaction(async (tx) => {
      // Get batch to know which medicine it is
      const [batch] = await tx.select().from(schema.batches).where(eq(schema.batches.id, batchId)).limit(1);
      if (!batch) throw new Error("Batch not found");

      await recordStockMovement({
        tx,
        tenantId: session.tenantId,
        storeId: session.storeId,
        batchId,
        medicineId: batch.medicineId,
        type: reason,
        qtyChange,
        note: note || `Manual ${reason}`,
        userId: user.id,
      });

      // Optionally record in stock_adjustments for easier querying of losses
      await tx.insert(schema.stockAdjustments).values({
        tenantId: session.tenantId,
        storeId: session.storeId,
        batchId,
        qtyChange,
        kind: reason,
        reason: note || `Manual ${reason}`,
        userId: user.id,
      });
    });

    revalidatePath("/dashboard/inventory/batches");
    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Failed to adjust stock" };
  }
}
