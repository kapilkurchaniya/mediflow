"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql, lte } from "drizzle-orm";
import { recordStockMovement } from "@/server/domain/stock";
import { writeAudit } from "@/server/audit";
import { requirePermission, checkPermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { addDays, format } from "date-fns";
import { protectedAction } from "@/server/action";

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
      // The medicine must belong to this pharmacy (never trust an id from the browser)
      const [medicine] = await tx
        .select({
          id: schema.medicines.id,
          purchasePrice: schema.medicines.purchasePrice,
          mrp: schema.medicines.mrp,
        })
        .from(schema.medicines)
        .where(and(eq(schema.medicines.id, medicineId), eq(schema.medicines.tenantId, ctx.tenantId)));
      if (!medicine) throw new Error("Medicine not found");

      // If purchase rate was not provided, fallback to medicine master or estimated 80% MRP
      const finalPurchaseRate =
        purchaseRate > 0
          ? purchaseRate
          : medicine.purchasePrice > 0
            ? medicine.purchasePrice
            : mrp > 0
              ? Math.round(mrp * 0.8)
              : 0;

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
            purchaseRate: finalPurchaseRate,
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
        unitCost: finalPurchaseRate,
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
      const [batch] = await tx
        .select()
        .from(schema.batches)
        .where(and(eq(schema.batches.id, batchId), eq(schema.batches.tenantId, ctx.tenantId), eq(schema.batches.storeId, ctx.storeId)))
        .limit(1);
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
    revalidatePath("/dashboard/inventory", "layout");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to adjust stock" };
  }
}

const updateBatchSchema = z.object({
  batchId: z.string().min(1, "Batch ID is required"),
  batchNo: z.string().min(1, "Batch number is required"),
  expiryDate: z.string().min(1, "Expiry date is required"),
  purchaseRate: z.coerce.number().min(0, "Purchase rate must be non-negative"),
  mrp: z.coerce.number().min(0, "MRP must be non-negative"),
  saleRate: z.coerce.number().min(0, "Sale rate must be non-negative").optional().default(0),
});

export async function updateBatch(formData: FormData) {
  const auth = await checkPermission("inventory.adjust");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  const parsed = updateBatchSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { batchId, batchNo, expiryDate } = parsed.data;
  const purchaseRate = Math.round(parsed.data.purchaseRate * 100);
  const mrp = Math.round(parsed.data.mrp * 100);
  const saleRate = parsed.data.saleRate ? Math.round(parsed.data.saleRate * 100) : mrp;

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.batches)
        .where(
          and(
            eq(schema.batches.id, batchId),
            eq(schema.batches.tenantId, ctx.tenantId),
            eq(schema.batches.storeId, ctx.storeId)
          )
        )
        .limit(1);

      if (!existing) throw new Error("Batch not found");

      await tx
        .update(schema.batches)
        .set({
          batchNo: batchNo.trim().toUpperCase(),
          expiryDate,
          purchaseRate,
          mrp,
          saleRate,
        })
        .where(eq(schema.batches.id, batchId));

      // If the medicine's master purchasePrice or mrp is 0, update it as well
      await tx
        .update(schema.medicines)
        .set({
          purchasePrice: purchaseRate > 0 ? purchaseRate : undefined,
          mrp: mrp > 0 ? mrp : undefined,
          salePrice: saleRate > 0 ? saleRate : undefined,
        })
        .where(
          and(
            eq(schema.medicines.id, existing.medicineId),
            eq(schema.medicines.tenantId, ctx.tenantId),
            sql`${schema.medicines.purchasePrice} = 0 OR ${schema.medicines.mrp} = 0`
          )
        );

      await writeAudit(tx, ctx, {
        action: "stock_adjust",
        entityType: "batch",
        entityId: batchId,
        oldValue: {
          batchNo: existing.batchNo,
          expiryDate: existing.expiryDate,
          purchaseRate: existing.purchaseRate,
          mrp: existing.mrp,
        },
        newValue: { batchNo, expiryDate, purchaseRate, mrp, saleRate },
        reason: "User updated batch details",
      });
    });

    revalidatePath("/dashboard/inventory/batches");
    revalidatePath("/dashboard/inventory", "layout");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to update batch" };
  }
}

export async function backfillZeroPurchaseRates() {
  const auth = await checkPermission("inventory.adjust");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  try {
    const zeroBatches = await db
      .select({
        batchId: schema.batches.id,
        batchMrp: schema.batches.mrp,
        medPurchasePrice: schema.medicines.purchasePrice,
        medMrp: schema.medicines.mrp,
      })
      .from(schema.batches)
      .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
      .where(
        and(
          eq(schema.batches.tenantId, ctx.tenantId),
          eq(schema.batches.storeId, ctx.storeId),
          eq(schema.batches.purchaseRate, 0)
        )
      );

    let updatedCount = 0;
    for (const b of zeroBatches) {
      const estPtr =
        b.medPurchasePrice > 0
          ? b.medPurchasePrice
          : b.batchMrp > 0
            ? Math.round(b.batchMrp * 0.8)
            : b.medMrp > 0
              ? Math.round(b.medMrp * 0.8)
              : 0;

      if (estPtr > 0) {
        await db
          .update(schema.batches)
          .set({ purchaseRate: estPtr })
          .where(eq(schema.batches.id, b.batchId));
        updatedCount++;
      }
    }

    revalidatePath("/dashboard/inventory/batches");
    revalidatePath("/dashboard/inventory", "layout");
    revalidatePath("/dashboard");
    return { success: true, count: updatedCount };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to backfill purchase rates" };
  }
}

const OcrStockItemSchema = z.object({
  medicineId: z.string().uuid().nullable(),
  medicineName: z.string().trim().min(1),
  genericName: z.string().optional(),
  manufacturer: z.string().optional(),
  hsn: z.string().optional(),
  batchNo: z.string().trim().min(1),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unitsPerPack: z.number().int().min(1).default(1),
  baseQty: z.number().int().min(0),
  ptrPaise: z.number().int().min(0).default(0),
  mrpPaise: z.number().int().min(0).default(0),
  saleRatePaise: z.number().int().min(0).default(0),
  gstRateBp: z.number().int().min(0).default(1200),
});

const OcrStockCommitSchema = z.object({
  mode: z.enum(["add", "set"]),
  createMissingMedicines: z.boolean().default(true),
  items: z.array(OcrStockItemSchema).min(1),
});

export const commitOcrStockUpdateAction = protectedAction("inventory.adjust")
  .schema(OcrStockCommitSchema)
  .action(async ({ parsedInput, ctx }) => {
    const updatedCount = await db.transaction(async (tx) => {
      let processed = 0;

      for (const item of parsedInput.items) {
        let medicineId = item.medicineId;

        if (!medicineId) {
          const [existingMed] = await tx
            .select({ id: schema.medicines.id })
            .from(schema.medicines)
            .where(
              and(
                eq(schema.medicines.tenantId, ctx.tenantId),
                sql`lower(${schema.medicines.name}) = lower(${item.medicineName})`,
              ),
            )
            .limit(1);

          if (existingMed) {
            medicineId = existingMed.id;
          } else if (parsedInput.createMissingMedicines) {
            let manufacturerId: string | null = null;
            const mfgName = item.manufacturer?.trim();
            if (mfgName) {
              const [existingMfg] = await tx
                .select({ id: schema.manufacturers.id })
                .from(schema.manufacturers)
                .where(
                  and(
                    eq(schema.manufacturers.tenantId, ctx.tenantId),
                    sql`lower(${schema.manufacturers.name}) = lower(${mfgName})`,
                  ),
                )
                .limit(1);
              if (existingMfg) {
                manufacturerId = existingMfg.id;
              } else {
                const [createdMfg] = await tx
                  .insert(schema.manufacturers)
                  .values({ tenantId: ctx.tenantId, name: mfgName })
                  .returning({ id: schema.manufacturers.id });
                manufacturerId = createdMfg.id;
              }
            }

            const [createdMed] = await tx
              .insert(schema.medicines)
              .values({
                tenantId: ctx.tenantId,
                name: item.medicineName,
                genericName: item.genericName?.trim() || null,
                manufacturerId,
                hsn: item.hsn?.trim() || null,
                unitsPerPack: item.unitsPerPack,
                gstRateBp: item.gstRateBp,
                mrp: item.mrpPaise > 0 ? item.mrpPaise : 0,
                purchasePrice: item.ptrPaise > 0 ? item.ptrPaise : 0,
                salePrice:
                  item.saleRatePaise > 0
                    ? item.saleRatePaise
                    : item.mrpPaise > 0
                      ? item.mrpPaise
                      : 0,
              })
              .returning({ id: schema.medicines.id });
            medicineId = createdMed.id;
          } else {
            throw new Error(
              `Medicine "${item.medicineName}" is not in your catalog. Enable "Create missing medicines in catalog" or remove the row.`,
            );
          }
        }

        const cleanBatchNo = item.batchNo.trim().toUpperCase();
        const [existingBatch] = await tx
          .select({
            id: schema.batches.id,
            qtyOnHand: schema.batches.qtyOnHand,
          })
          .from(schema.batches)
          .where(
            and(
              eq(schema.batches.tenantId, ctx.tenantId),
              eq(schema.batches.storeId, ctx.storeId),
              eq(schema.batches.medicineId, medicineId),
              eq(schema.batches.batchNo, cleanBatchNo),
            ),
          )
          .limit(1);

        const resolvedSaleRate =
          item.saleRatePaise > 0 ? item.saleRatePaise : item.mrpPaise;

        let batchId: string;
        let currentQty = 0;

        if (existingBatch) {
          batchId = existingBatch.id;
          currentQty = existingBatch.qtyOnHand;
        } else {
          const [createdBatch] = await tx
            .insert(schema.batches)
            .values({
              tenantId: ctx.tenantId,
              storeId: ctx.storeId,
              medicineId,
              batchNo: cleanBatchNo,
              expiryDate: item.expiryDate,
              purchaseRate: item.ptrPaise > 0 ? item.ptrPaise : 0,
              mrp: item.mrpPaise > 0 ? item.mrpPaise : 0,
              saleRate: resolvedSaleRate > 0 ? resolvedSaleRate : 0,
              qtyOnHand: 0,
            })
            .returning({ id: schema.batches.id });
          batchId = createdBatch.id;
        }

        const qtyDelta =
          parsedInput.mode === "add" ? item.baseQty : item.baseQty - currentQty;

        if (qtyDelta !== 0) {
          await recordStockMovement({
            tx,
            tenantId: ctx.tenantId,
            storeId: ctx.storeId,
            batchId,
            medicineId,
            type: existingBatch ? "adjustment" : "opening",
            qtyChange: qtyDelta,
            unitCost: item.ptrPaise > 0 ? item.ptrPaise : null,
            refType: "ocr_stock_update",
            note:
              parsedInput.mode === "add"
                ? `OCR stock sheet (+${item.baseQty})`
                : `OCR stock count set to ${item.baseQty}`,
            userId: ctx.userId,
          });
        }

        processed++;
      }

      await writeAudit(tx, ctx, {
        action: "stock_adjust",
        entityType: "batch",
        newValue: {
          source: "ocr_stock_sheet",
          mode: parsedInput.mode,
          updatedCount: processed,
        },
      });

      return processed;
    });

    revalidatePath("/dashboard/inventory/batches");
    revalidatePath("/dashboard/inventory", "layout");
    revalidatePath("/dashboard/pos");
    revalidatePath("/dashboard");
    return { updatedCount };
  });
