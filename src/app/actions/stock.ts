"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql, lte } from "drizzle-orm";
import { recordStockMovement } from "@/server/domain/stock";
import { writeAudit } from "@/server/audit";
import { requirePermission, checkPermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { addDays, format } from "date-fns";

export async function getBatches(
  opts?:
    | {
        nearExpiryOnly?: boolean;
        from?: string | null;
        to?: string | null;
      }
    | boolean
) {
  const ctx = await requirePermission("inventory.view");

  const isBool = typeof opts === "boolean";
  const nearExpiryOnly = isBool ? opts : Boolean(opts?.nearExpiryOnly);
  const from = !isBool ? opts?.from : null;
  const to = !isBool ? opts?.to : null;

  const ninetyDaysFromNow = nearExpiryOnly ? format(addDays(new Date(), 90), "yyyy-MM-dd") : undefined;

  const conditions = [
    eq(schema.batches.tenantId, ctx.tenantId),
    eq(schema.batches.storeId, ctx.storeId),
  ];

  if (nearExpiryOnly && ninetyDaysFromNow) {
    conditions.push(lte(schema.batches.expiryDate, ninetyDaysFromNow));
  } else {
    if (from) {
      conditions.push(sql`${schema.batches.expiryDate} >= ${from}`);
    }
    if (to) {
      conditions.push(sql`${schema.batches.expiryDate} <= ${to}`);
    }
  }

  const query = db
    .select({
      batch: schema.batches,
      medicine: schema.medicines,
    })
    .from(schema.batches)
    .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
    .where(and(...conditions));

  const results = await query.orderBy(schema.batches.expiryDate);
  return results;
}

import { z } from "zod";

const openingStockSchema = z.object({
  medicineId: z.string().min(1, "Medicine is required"),
  batchNo: z.string().min(1, "Batch number is required"),
  expiryDate: z.string().min(1, "Expiry date is required"),
  qty: z.coerce.number().int().min(1, "Quantity must be greater than 0"),
  purchaseRate: z.coerce.number().optional().default(0),
  mrp: z.coerce.number().optional().default(0),
  saleRate: z.coerce.number().optional().default(0),
});

export async function addOpeningStock(formData: FormData) {
  const auth = await checkPermission("inventory.adjust");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  const parsed = openingStockSchema.safeParse(Object.fromEntries(formData.entries()));
  
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { medicineId, batchNo, expiryDate, qty } = parsed.data;
  const purchaseRate = Math.round(parsed.data.purchaseRate * 100);
  const mrp = Math.round(parsed.data.mrp * 100);
  const saleRate = parsed.data.saleRate ? Math.round(parsed.data.saleRate * 100) : mrp;

  try {
    await db.transaction(async (tx) => {
      // Check if batch already exists
      const existingBatch = await tx
        .select()
        .from(schema.batches)
        .where(
          and(
            eq(schema.batches.storeId, ctx.storeId),
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
            tenantId: ctx.tenantId,
            storeId: ctx.storeId,
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
      const balanceAfter = await recordStockMovement({
        tx,
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        batchId,
        medicineId,
        type: "opening",
        qtyChange: qty,
        unitCost: purchaseRate,
        note: "Opening stock entry",
        userId: ctx.userId,
      });

      await writeAudit(tx, ctx, {
        action: "stock_adjust",
        entityType: "batch",
        entityId: batchId,
        oldValue: { qtyOnHand: balanceAfter - qty },
        newValue: { qtyOnHand: balanceAfter, batchNo, medicineId },
        reason: "Opening stock entry",
      });
    });

    revalidatePath("/dashboard/inventory/batches");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to add opening stock" };
  }
}

const adjustBatchStockSchema = z.object({
  batchId: z.string().min(1, "Batch is required"),
  qtyChange: z.coerce.number().refine(val => val !== 0, "Quantity change cannot be 0"),
  reason: z.enum(["damage", "expired", "adjustment"]),
  note: z.string().optional(),
});

export async function adjustBatchStock(formData: FormData) {
  const auth = await checkPermission("inventory.adjust");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  const parsed = adjustBatchStockSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { batchId, qtyChange, reason, note } = parsed.data;

  try {
    await db.transaction(async (tx) => {
      // Get batch to know which medicine it is
      const [batch] = await tx.select().from(schema.batches).where(eq(schema.batches.id, batchId)).limit(1);
      if (!batch) throw new Error("Batch not found");

      const balanceAfter = await recordStockMovement({
        tx,
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        batchId,
        medicineId: batch.medicineId,
        type: reason,
        qtyChange,
        note: note || `Manual ${reason}`,
        userId: ctx.userId,
      });

      await writeAudit(tx, ctx, {
        action: "stock_adjust",
        entityType: "batch",
        entityId: batchId,
        oldValue: { qtyOnHand: balanceAfter - qtyChange },
        newValue: { qtyOnHand: balanceAfter },
        reason: note ? `${reason}: ${note}` : reason,
      });

      // Optionally record in stock_adjustments for easier querying of losses
      await tx.insert(schema.stockAdjustments).values({
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        batchId,
        qtyChange,
        kind: reason,
        reason: note || `Manual ${reason}`,
        userId: ctx.userId,
      });
    });

    revalidatePath("/dashboard/inventory/batches");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to adjust stock" };
  }
}
