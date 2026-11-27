"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, or, sql, lte } from "drizzle-orm";
import { recordStockMovement } from "@/server/domain/stock";
import { writeAudit } from "@/server/audit";
import { requirePermission, checkPermission } from "@/server/rbac";
import { canViewCost, redactBatchCost, redactMedicineCost } from "@/server/redact";
import { revalidatePath } from "next/cache";
import { addDays, format } from "date-fns";
import { protectedAction } from "@/server/action";
import { normalizeDrugSchedule, scheduleRequiresRx } from "@/lib/schedule";

export async function getBatches(
  opts?:
    | {
        nearExpiryOnly?: boolean;
        from?: string | null;
        to?: string | null;
        medicineId?: string | null;
        segment?: string | null;
        molecule?: string | null;
        categoryId?: string | null;
        rackId?: string | null;
        limit?: number;
        offset?: number;
      }
    | boolean
) {
  const ctx = await requirePermission("inventory.view");

  const isBool = typeof opts === "boolean";
  const nearExpiryOnly = isBool ? opts : Boolean(opts?.nearExpiryOnly);
  const from = !isBool ? opts?.from : null;
  const to = !isBool ? opts?.to : null;
  const medicineId = !isBool ? opts?.medicineId : null;
  const segment = !isBool ? opts?.segment : null;
  const molecule = !isBool ? opts?.molecule : null;
  const categoryId = !isBool ? opts?.categoryId : null;
  const rackId = !isBool ? opts?.rackId : null;
  const limit = !isBool ? opts?.limit : undefined;
  const offset = !isBool ? opts?.offset ?? 0 : 0;

  const ninetyDaysFromNow = nearExpiryOnly ? format(addDays(new Date(), 90), "yyyy-MM-dd") : undefined;

  const conditions = [
    eq(schema.batches.tenantId, ctx.tenantId),
    eq(schema.batches.storeId, ctx.storeId),
  ];

  if (medicineId) {
    conditions.push(eq(schema.batches.medicineId, medicineId));
  }
  if (segment && segment !== "all") {
    conditions.push(eq(schema.medicines.targetSegment, segment));
  }
  if (categoryId) {
    conditions.push(eq(schema.medicines.categoryId, categoryId));
  }
  if (molecule?.trim()) {
    const mq = `%${molecule.trim().toLowerCase()}%`;
    conditions.push(
      sql`(lower(coalesce(${schema.medicines.genericName}, '')) like ${mq} or lower(coalesce(${schema.medicines.composition}, '')) like ${mq} or lower(${schema.medicines.name}) like ${mq})`
    );
  }
  if (rackId) {
    conditions.push(
      sql`exists (
        select 1 from ${schema.storeMedicineSettings} sms
        where sms.medicine_id = ${schema.batches.medicineId}
          and sms.store_id = ${ctx.storeId}
          and sms.tenant_id = ${ctx.tenantId}
          and sms.rack_id = ${rackId}
      )`
    );
  }

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

  const baseQuery = db
    .select({
      batch: schema.batches,
      medicine: schema.medicines,
    })
    .from(schema.batches)
    .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
    .where(and(...conditions))
    .orderBy(schema.batches.expiryDate);

  const rows =
    typeof limit === "number" && limit > 0
      ? await baseQuery.limit(limit).offset(Math.max(0, offset))
      : await baseQuery;

  return rows.map((r) => ({
    batch: redactBatchCost(r.batch, ctx),
    medicine: redactMedicineCost(r.medicine, ctx),
  }));
}

export async function getBatchesSummary(opts?: {
  nearExpiryOnly?: boolean;
  from?: string | null;
  to?: string | null;
  medicineId?: string | null;
  segment?: string | null;
  molecule?: string | null;
  categoryId?: string | null;
  rackId?: string | null;
}) {
  const ctx = await requirePermission("inventory.view");

  const nearExpiryOnly = Boolean(opts?.nearExpiryOnly);
  const from = opts?.from ?? null;
  const to = opts?.to ?? null;
  const medicineId = opts?.medicineId ?? null;
  const segment = opts?.segment ?? null;
  const molecule = opts?.molecule ?? null;
  const categoryId = opts?.categoryId ?? null;
  const rackId = opts?.rackId ?? null;
  const ninetyDaysFromNow = format(addDays(new Date(), 90), "yyyy-MM-dd");

  const conditions = [
    eq(schema.batches.tenantId, ctx.tenantId),
    eq(schema.batches.storeId, ctx.storeId),
  ];

  if (medicineId) {
    conditions.push(eq(schema.batches.medicineId, medicineId));
  }
  if (segment && segment !== "all") {
    conditions.push(eq(schema.medicines.targetSegment, segment));
  }
  if (categoryId) {
    conditions.push(eq(schema.medicines.categoryId, categoryId));
  }
  if (molecule?.trim()) {
    const mq = `%${molecule.trim().toLowerCase()}%`;
    conditions.push(
      sql`(lower(coalesce(${schema.medicines.genericName}, '')) like ${mq} or lower(coalesce(${schema.medicines.composition}, '')) like ${mq} or lower(${schema.medicines.name}) like ${mq})`
    );
  }
  if (rackId) {
    conditions.push(
      sql`exists (
        select 1 from ${schema.storeMedicineSettings} sms
        where sms.medicine_id = ${schema.batches.medicineId}
          and sms.store_id = ${ctx.storeId}
          and sms.tenant_id = ${ctx.tenantId}
          and sms.rack_id = ${rackId}
      )`
    );
  }

  if (nearExpiryOnly) {
    conditions.push(lte(schema.batches.expiryDate, ninetyDaysFromNow));
  } else {
    if (from) conditions.push(sql`${schema.batches.expiryDate} >= ${from}`);
    if (to) conditions.push(sql`${schema.batches.expiryDate} <= ${to}`);
  }

  const effectivePtrSql = sql`CASE
    WHEN ${schema.batches.purchaseRate} > 0 THEN ${schema.batches.purchaseRate}
    WHEN ${schema.medicines.purchasePrice} > 0 THEN ${schema.medicines.purchasePrice}
    WHEN ${schema.batches.mrp} > 0 THEN ROUND(${schema.batches.mrp} * 0.8)
    WHEN ${schema.medicines.mrp} > 0 THEN ROUND(${schema.medicines.mrp} * 0.8)
    ELSE 0
  END`;

  const [row] = await db
    .select({
      totalCount: sql<number>`count(*)::int`,
      totalUnits: sql<number>`coalesce(sum(${schema.batches.qtyOnHand}), 0)::bigint`.mapWith(Number),
      totalValuation: sql<number>`coalesce(sum(${schema.batches.qtyOnHand} * (${effectivePtrSql})), 0)::bigint`.mapWith(Number),
      zeroRateCount: sql<number>`count(*) filter (where ${schema.batches.purchaseRate} = 0)::int`,
      expiringCount: sql<number>`count(*) filter (where ${schema.batches.expiryDate} <= ${ninetyDaysFromNow})::int`,
    })
    .from(schema.batches)
    .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
    .where(and(...conditions));

  const allowCost = canViewCost(ctx);
  return {
    totalCount: row?.totalCount ?? 0,
    totalUnits: row?.totalUnits ?? 0,
    totalValuation: allowCost ? (row?.totalValuation ?? 0) : 0,
    zeroRateCount: allowCost ? (row?.zeroRateCount ?? 0) : 0,
    expiringCount: row?.expiringCount ?? 0,
  };
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
  status: z.enum(["active", "hold"]).optional(),
  stockMode: z.enum(["keep", "set", "adjust"]).optional().default("keep"),
  targetQty: z.coerce.number().int().min(0, "Stock quantity cannot be negative").optional(),
  qtyDelta: z.coerce.number().int().optional(),
  adjustReason: z.enum(["adjustment", "damage", "expired"]).optional().default("adjustment"),
  adjustNote: z.string().optional(),
});

export async function updateBatch(formData: FormData) {
  const auth = await checkPermission("inventory.adjust");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  const parsed = updateBatchSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const {
    batchId,
    batchNo,
    expiryDate,
    status,
    stockMode,
    targetQty,
    qtyDelta: rawDelta,
    adjustReason,
    adjustNote,
  } = parsed.data;
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

      const nextStatus = status ?? existing.status;

      await tx
        .update(schema.batches)
        .set({
          batchNo: batchNo.trim().toUpperCase(),
          expiryDate,
          purchaseRate,
          mrp,
          saleRate,
          status: nextStatus,
          updatedAt: new Date(),
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

      const computedDelta =
        stockMode === "set" && targetQty !== undefined
          ? targetQty - existing.qtyOnHand
          : stockMode === "adjust" && rawDelta !== undefined
            ? rawDelta
            : 0;

      let balanceAfter = existing.qtyOnHand;
      if (computedDelta !== 0) {
        balanceAfter = await recordStockMovement({
          tx,
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          batchId,
          medicineId: existing.medicineId,
          type: adjustReason,
          qtyChange: computedDelta,
          unitCost: purchaseRate > 0 ? purchaseRate : null,
          note: adjustNote?.trim() || `Batch edit (${stockMode === "set" ? "set exact count" : adjustReason})`,
          userId: ctx.userId,
        });

        await tx.insert(schema.stockAdjustments).values({
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          batchId,
          qtyChange: computedDelta,
          kind: adjustReason,
          reason: adjustNote?.trim() || `Batch edit (${adjustReason})`,
          userId: ctx.userId,
        });
      }

      await writeAudit(tx, ctx, {
        action: "stock_adjust",
        entityType: "batch",
        entityId: batchId,
        oldValue: {
          batchNo: existing.batchNo,
          expiryDate: existing.expiryDate,
          purchaseRate: existing.purchaseRate,
          mrp: existing.mrp,
          status: existing.status,
          qtyOnHand: existing.qtyOnHand,
        },
        newValue: {
          batchNo: batchNo.trim().toUpperCase(),
          expiryDate,
          purchaseRate,
          mrp,
          saleRate,
          status: nextStatus,
          qtyOnHand: balanceAfter,
        },
        reason: adjustNote?.trim() || "User updated batch details",
      });
    });

    revalidatePath("/dashboard/inventory/batches");
    revalidatePath("/dashboard/inventory", "layout");
    revalidatePath("/dashboard/sales/pos");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    if ((err instanceof Error ? err.message : String(err))?.includes("batches_store_med_batch_uq")) {
      return { error: "A batch with this number already exists for this medicine in this store." };
    }
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
  schedule: z.string().optional(),
  rxRequired: z.boolean().optional(),
  batchNo: z.string().trim().min(1),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unitsPerPack: z.number().int().min(1).default(1),
  packUnit: z.string().optional(),
  looseUnit: z.string().optional(),
  updateCatalogPackSize: z.boolean().default(false),
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
        const itemSchedule = normalizeDrugSchedule(item.schedule);
        const itemRxRequired = item.rxRequired ?? scheduleRequiresRx(itemSchedule);
        let medicineId = item.medicineId;
        let existingSchedule: string | null = null;

        if (!medicineId) {
          const [existingMed] = await tx
            .select({ id: schema.medicines.id, schedule: schema.medicines.schedule })
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
            existingSchedule = existingMed.schedule;
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
                schedule: itemSchedule,
                rxRequired: itemRxRequired,
                unitsPerPack: item.unitsPerPack,
                ...(item.packUnit ? { packUnit: item.packUnit } : {}),
                ...(item.looseUnit ? { looseUnit: item.looseUnit } : {}),
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
        } else {
          const [matchedRow] = await tx
            .select({ schedule: schema.medicines.schedule })
            .from(schema.medicines)
            .where(
              and(
                eq(schema.medicines.id, medicineId),
                eq(schema.medicines.tenantId, ctx.tenantId),
              ),
            )
            .limit(1);
          existingSchedule = matchedRow?.schedule ?? null;
        }

        // Upgrade catalog schedule automatically when the bill specifies a drug schedule
        // (e.g. Schedule H / H1 / X / G) and catalog was previously "none".
        if (
          medicineId &&
          itemSchedule !== "none" &&
          (!existingSchedule || existingSchedule === "none")
        ) {
          await tx
            .update(schema.medicines)
            .set({
              schedule: itemSchedule,
              rxRequired: scheduleRequiresRx(itemSchedule) || itemRxRequired,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.medicines.id, medicineId),
                eq(schema.medicines.tenantId, ctx.tenantId),
              ),
            );
        }

        if (medicineId && item.updateCatalogPackSize && item.unitsPerPack > 1) {
          await tx
            .update(schema.medicines)
            .set({
              unitsPerPack: item.unitsPerPack,
              ...(item.packUnit ? { packUnit: item.packUnit } : {}),
              ...(item.looseUnit ? { looseUnit: item.looseUnit } : {}),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.medicines.id, medicineId),
                eq(schema.medicines.tenantId, ctx.tenantId),
              ),
            );
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
        const basePurchaseRate =
          item.ptrPaise > 0
            ? Math.round(item.ptrPaise / Math.max(1, item.unitsPerPack))
            : 0;

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
              purchaseRate: basePurchaseRate,
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
            unitCost: basePurchaseRate > 0 ? basePurchaseRate : null,
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
    revalidatePath("/dashboard/purchases/expiry-returns");
    revalidatePath("/dashboard/inventory/quarantine");
    revalidatePath("/dashboard/sales/pos");
    revalidatePath("/dashboard");
    return { updatedCount };
  });

export async function removeOrRecallBatchStock(params: {
  batchId: string;
  mode: "recall" | "writeoff" | "delete";
  reason?: string;
}): Promise<{ success?: boolean; deleted?: boolean; message?: string; error?: string }> {
  const auth = await checkPermission("inventory.adjust");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  const cleanReason =
    params.reason?.trim() ||
    (params.mode === "recall"
      ? "Medicine banned / regulatory recall"
      : params.mode === "delete"
      ? "Removed unused batch"
      : "Stock written off");

  try {
    const result = await db.transaction(async (tx) => {
      const [batch] = await tx
        .select()
        .from(schema.batches)
        .where(
          and(
            eq(schema.batches.id, params.batchId),
            eq(schema.batches.tenantId, ctx.tenantId),
            eq(schema.batches.storeId, ctx.storeId)
          )
        )
        .for("update");

      if (!batch) {
        throw new Error("Batch not found in this branch.");
      }

      if (params.mode === "delete") {
        const [saleRef] = await tx
          .select({ id: schema.saleItems.id })
          .from(schema.saleItems)
          .where(eq(schema.saleItems.batchId, batch.id))
          .limit(1);
        const [purchaseRef] = await tx
          .select({ id: schema.purchaseItems.id })
          .from(schema.purchaseItems)
          .where(eq(schema.purchaseItems.batchId, batch.id))
          .limit(1);
        const [quarantineRef] = await tx
          .select({ id: schema.quarantineBatches.id })
          .from(schema.quarantineBatches)
          .where(eq(schema.quarantineBatches.batchId, batch.id))
          .limit(1);
        const [transferRef] = await tx
          .select({ id: schema.stockTransferItems.id })
          .from(schema.stockTransferItems)
          .where(
            or(
              eq(schema.stockTransferItems.fromBatchId, batch.id),
              eq(schema.stockTransferItems.toBatchId, batch.id)
            )
          )
          .limit(1);
        const [dispensingRef] = await tx
          .select({ id: schema.dispensingLogs.id })
          .from(schema.dispensingLogs)
          .where(eq(schema.dispensingLogs.batchId, batch.id))
          .limit(1);

        if (!saleRef && !purchaseRef && !quarantineRef && !transferRef && !dispensingRef) {
          await tx
            .delete(schema.stockMovements)
            .where(
              and(
                eq(schema.stockMovements.batchId, batch.id),
                eq(schema.stockMovements.tenantId, ctx.tenantId)
              )
            );
          await tx
            .delete(schema.batches)
            .where(eq(schema.batches.id, batch.id));

          await writeAudit(tx, ctx, {
            action: "delete",
            entityType: "batch",
            entityId: batch.id,
            oldValue: { batchNo: batch.batchNo, qtyOnHand: batch.qtyOnHand },
            reason: cleanReason,
          });
          return { deleted: true, message: `Batch ${batch.batchNo} permanently removed.` };
        }
      }

      // Statutory recall / write-off path (preserves immutable audit & GST history)
      const prevQty = batch.qtyOnHand;
      if (prevQty > 0) {
        await recordStockMovement({
          tx,
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          batchId: batch.id,
          medicineId: batch.medicineId,
          type: "damage",
          qtyChange: -prevQty,
          unitCost: batch.purchaseRate > 0 ? batch.purchaseRate : null,
          refType: params.mode === "recall" ? "ban_recall" : "writeoff",
          note: cleanReason,
          userId: ctx.userId,
        });

        if (params.mode === "recall") {
          await tx.insert(schema.quarantineBatches).values({
            tenantId: ctx.tenantId,
            storeId: ctx.storeId,
            batchId: batch.id,
            medicineId: batch.medicineId,
            supplierId: batch.supplierId,
            qty: prevQty,
            reason: "recalled",
            status: "quarantined",
            notes: cleanReason,
            quarantinedBy: ctx.userId,
          });
        }
      }

      await tx
        .update(schema.batches)
        .set({ status: "hold", updatedAt: new Date() })
        .where(eq(schema.batches.id, batch.id));

      await writeAudit(tx, ctx, {
        action: "stock_adjust",
        entityType: "batch",
        entityId: batch.id,
        oldValue: { batchNo: batch.batchNo, qtyOnHand: prevQty, status: batch.status },
        newValue: { batchNo: batch.batchNo, qtyOnHand: 0, status: "hold", mode: params.mode },
        reason: cleanReason,
      });

      const msg =
        params.mode === "delete"
          ? `Batch ${batch.batchNo} has transaction history so it cannot be hard-deleted; stock was zeroed and placed on Hold (blocked from POS).`
          : params.mode === "recall"
          ? `Batch ${batch.batchNo} (${prevQty} units) recalled, blocked from POS, and moved to Quarantine for vendor claim.`
          : `Batch ${batch.batchNo} stock (${prevQty} units) written off and placed on Hold.`;

      return { deleted: false, message: msg };
    });

    revalidatePath("/dashboard/inventory/batches");
    revalidatePath("/dashboard/inventory", "layout");
    revalidatePath("/dashboard/inventory/quarantine");
    revalidatePath("/dashboard/purchases/expiry-returns");
    revalidatePath("/dashboard/sales/pos");
    revalidatePath("/dashboard");
    return { success: true, ...result };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to remove batch stock" };
  }
}
