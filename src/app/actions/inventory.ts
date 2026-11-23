"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, ilike, or, sql, inArray } from "drizzle-orm";
import { requirePermission, checkPermission, can } from "@/server/rbac";
import { writeAudit } from "@/server/audit";
import { recordStockMovement } from "@/server/domain/stock";
import { DEFAULT_GST_RATE_BP, isValidGstRateBp } from "@/lib/regulatory";
import { revalidatePath } from "next/cache";
import { z } from "zod";

// --- Categories ---

export async function getCategories() {
  const ctx = await requirePermission("medicine.view");

  return db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.tenantId, ctx.tenantId))
    .orderBy(schema.categories.name);
}

export async function createCategory(name: string) {
  const auth = await checkPermission("medicine.manage");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  try {
    const [category] = await db
      .insert(schema.categories)
      .values({
        tenantId: ctx.tenantId,
        name,
      })
      .returning();
    return { success: true, category };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create category" };
  }
}

// --- Manufacturers ---

export async function getManufacturers() {
  const ctx = await requirePermission("medicine.view");

  return db
    .select()
    .from(schema.manufacturers)
    .where(eq(schema.manufacturers.tenantId, ctx.tenantId))
    .orderBy(schema.manufacturers.name);
}

export async function createManufacturer(name: string) {
  const auth = await checkPermission("medicine.manage");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  try {
    const [manufacturer] = await db
      .insert(schema.manufacturers)
      .values({
        tenantId: ctx.tenantId,
        name,
      })
      .returning();
    return { success: true, manufacturer };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create manufacturer" };
  }
}

// --- Medicines ---

export type MedicinePackFilter = "all" | "single";

function buildMedicineSearchConditions(
  tenantId: string,
  searchQuery?: string,
  packFilter: MedicinePackFilter = "all"
) {
  const conditions = [eq(schema.medicines.tenantId, tenantId)];

  if (packFilter === "single") {
    conditions.push(eq(schema.medicines.unitsPerPack, 1));
  }

  if (searchQuery?.trim()) {
    const q = `%${searchQuery.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(schema.medicines.name, q),
        ilike(schema.medicines.genericName, q),
        ilike(schema.medicines.barcode, q)
      )!
    );
  }

  return conditions;
}

export async function getMedicinesCount(
  searchQuery?: string,
  packFilter: MedicinePackFilter = "all"
): Promise<number> {
  const ctx = await requirePermission("medicine.view");
  const conditions = buildMedicineSearchConditions(ctx.tenantId, searchQuery, packFilter);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.medicines)
    .where(and(...conditions));

  return row?.count ?? 0;
}

export async function getMedicines(
  searchQuery?: string,
  limit = 50,
  offset = 0,
  packFilter: MedicinePackFilter = "all"
) {
  const ctx = await requirePermission("medicine.view");
  const conditions = buildMedicineSearchConditions(ctx.tenantId, searchQuery, packFilter);

  return db
    .select({
      medicine: schema.medicines,
      manufacturer: schema.manufacturers,
      category: schema.categories,
      rack: schema.racks,
      branchSettings: schema.storeMedicineSettings,
    })
    .from(schema.medicines)
    .leftJoin(schema.manufacturers, eq(schema.medicines.manufacturerId, schema.manufacturers.id))
    .leftJoin(schema.categories, eq(schema.medicines.categoryId, schema.categories.id))
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
    .where(and(...conditions))
    .orderBy(desc(schema.medicines.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function createMedicine(formData: FormData) {
  const auth = await checkPermission("medicine.manage");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  const name = formData.get("name") as string;
  const genericName = formData.get("genericName") as string;
  const manufacturerId = formData.get("manufacturerId") as string;
  const categoryId = formData.get("categoryId") as string;
  const rackId = formData.get("rackId") as string;
  const unit = (formData.get("unit") as string) || "strip";
  const packSize = formData.get("packSize") as string;
  const barcode = formData.get("barcode") as string;
  const hsn = formData.get("hsn") as string;
  
  const gstRateBpStr = formData.get("gstRateBp") as string;
  const mrpStr = formData.get("mrp") as string;
  const salePriceStr = formData.get("salePrice") as string;
  
  const rxRequired = formData.get("rxRequired") === "on";
  const schedule = formData.get("schedule") as string;

  const rawUnitsPerPack = formData.get("unitsPerPack");
  let unitsPerPack = 1;
  if (rawUnitsPerPack !== null && rawUnitsPerPack !== "") {
    const parsedUpp = Number(rawUnitsPerPack);
    if (!Number.isInteger(parsedUpp) || parsedUpp < 1 || !Number.isSafeInteger(parsedUpp)) {
      return { error: "Units per pack must be a whole number of at least 1." };
    }
    unitsPerPack = parsedUpp;
  }

  const packUnit = ((formData.get("packUnit") as string) || unit || "strip").trim().toLowerCase();
  const looseUnit = ((formData.get("looseUnit") as string) || "tablet").trim().toLowerCase();

  if (!name) return { error: "Name is required" };

  // Parse decimals to integers (basis points / paise)
  const gstRateBp = gstRateBpStr ? Math.round(parseFloat(gstRateBpStr) * 100) : DEFAULT_GST_RATE_BP; // GST 2.0: 5%
  if (!isValidGstRateBp(gstRateBp)) return { error: "Choose a valid GST rate (0%, 5%, 12%, 18% or 28%)." };
  const mrp = mrpStr ? Math.round(parseFloat(mrpStr) * 100) : 0;
  const salePrice = salePriceStr ? Math.round(parseFloat(salePriceStr) * 100) : mrp; // fallback to mrp

  // Category, manufacturer and rack must belong to this pharmacy (never trust an id from the browser)
  const owns = async (table: typeof schema.categories | typeof schema.manufacturers | typeof schema.racks, id: string) => {
    const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.tenantId, ctx.tenantId)));
    return !!row;
  };
  if (categoryId?.trim() && !(await owns(schema.categories, categoryId.trim()))) return { error: "Category not found." };
  if (manufacturerId?.trim() && !(await owns(schema.manufacturers, manufacturerId.trim()))) return { error: "Manufacturer not found." };
  if (rackId?.trim() && !(await owns(schema.racks, rackId.trim()))) return { error: "Rack not found." };

  try {
    await db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.medicines).values({
      tenantId: ctx.tenantId,
      name,
      genericName: genericName || null,
      manufacturerId: manufacturerId || null,
      categoryId: categoryId || null,
      unit: packUnit,
      unitsPerPack,
      packUnit,
      looseUnit,
      packSize: packSize || null,
      barcode: barcode || null,
      hsn: hsn || null,
      gstRateBp,
      mrp,
      salePrice,
      rxRequired,
      schedule: schedule || "none",
      isActive: true,
    }).returning({ id: schema.medicines.id });

    await writeAudit(tx, ctx, {
      action: "create",
      entityType: "medicine",
      entityId: created.id,
      newValue: {
        name,
        mrp,
        salePrice,
        gstRateBp,
        hsn: hsn || null,
        schedule: schedule || "none",
        rxRequired,
        unitsPerPack,
        packUnit,
        looseUnit,
      },
    });

    if (rackId?.trim()) {
      await tx.insert(schema.storeMedicineSettings).values({
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        medicineId: created.id,
        rackId: rackId.trim(),
      });
    }
    });

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (err: unknown) {
    if ((err instanceof Error ? err.message : String(err))?.includes("medicines_tenant_barcode_uq")) {
      return { error: "A medicine with this barcode already exists." };
    }
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create medicine" };
  }
}

const updateMedicineSchema = z.object({
  medicineId: z.string().uuid("Invalid medicine ID"),
  name: z.string().trim().min(1, "Name is required"),
  genericName: z.string().optional(),
  manufacturerId: z.string().optional(),
  categoryId: z.string().optional(),
  rackId: z.string().optional(),
  packSize: z.string().optional(),
  barcode: z.string().optional(),
  hsn: z.string().optional(),
  gstRatePct: z.coerce.number(),
  mrp: z.coerce.number().min(0, "MRP must be non-negative").default(0),
  salePrice: z.coerce.number().min(0, "Selling price must be non-negative").optional(),
  purchasePrice: z.coerce.number().min(0, "Purchase price must be non-negative").optional(),
  unitsPerPack: z.coerce.number().int().min(1, "Units per pack must be a whole number of at least 1"),
  packUnit: z.string().trim().min(1).default("strip"),
  looseUnit: z.string().trim().min(1).default("tablet"),
  rxRequired: z.boolean().default(false),
  schedule: z.enum(["none", "G", "H", "H1", "X", "narcotic"]).default("none"),
  isActive: z.boolean().default(true),
  convertExistingBatches: z.boolean().default(false),
});

export async function updateMedicine(formData: FormData) {
  const auth = await checkPermission("medicine.manage");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  const raw = Object.fromEntries(formData.entries());
  const parsed = updateMedicineSchema.safeParse({
    ...raw,
    rxRequired: formData.get("rxRequired") === "on" || formData.get("rxRequired") === "true",
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
    convertExistingBatches:
      formData.get("convertExistingBatches") === "on" ||
      formData.get("convertExistingBatches") === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const input = parsed.data;
  const gstRateBp = Math.round(input.gstRatePct * 100);
  if (!isValidGstRateBp(gstRateBp)) {
    return { error: "Choose a valid GST rate (0%, 5%, 12%, 18% or 28%)." };
  }

  if (input.convertExistingBatches && !can(ctx, "inventory.adjust")) {
    return { error: "You need inventory.adjust permission to convert existing batch stock." };
  }

  const mrpPaise = Math.round(input.mrp * 100);
  const salePricePaise =
    input.salePrice !== undefined && formData.get("salePrice") !== ""
      ? Math.round(input.salePrice * 100)
      : mrpPaise;
  const purchasePricePaise =
    input.purchasePrice !== undefined && formData.get("purchasePrice") !== ""
      ? Math.round(input.purchasePrice * 100)
      : undefined;

  const owns = async (
    table: typeof schema.categories | typeof schema.manufacturers,
    id: string,
  ) => {
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, id), eq(table.tenantId, ctx.tenantId)));
    return !!row;
  };
  const catId = input.categoryId?.trim() || null;
  const mfgId = input.manufacturerId?.trim() || null;
  const rackId = input.rackId?.trim() || null;
  if (catId && !(await owns(schema.categories, catId))) return { error: "Category not found." };
  if (mfgId && !(await owns(schema.manufacturers, mfgId))) return { error: "Manufacturer not found." };
  if (rackId) {
    const [rackRow] = await db
      .select({ id: schema.racks.id })
      .from(schema.racks)
      .where(
        and(
          eq(schema.racks.id, rackId),
          eq(schema.racks.tenantId, ctx.tenantId),
          eq(schema.racks.storeId, ctx.storeId),
        ),
      )
      .limit(1);
    if (!rackRow) return { error: "Selected rack was not found in this store." };
  }

  const cleanBarcode = input.barcode?.trim() || null;
  const cleanPackUnit = input.packUnit.toLowerCase();
  const cleanLooseUnit = input.looseUnit.toLowerCase();

  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.medicines)
        .where(and(eq(schema.medicines.id, input.medicineId), eq(schema.medicines.tenantId, ctx.tenantId)))
        .limit(1);

      if (!existing) throw new Error("Medicine not found.");

      await tx
        .update(schema.medicines)
        .set({
          name: input.name,
          genericName: input.genericName?.trim() || null,
          manufacturerId: mfgId,
          categoryId: catId,
          unit: cleanPackUnit,
          unitsPerPack: input.unitsPerPack,
          packUnit: cleanPackUnit,
          looseUnit: cleanLooseUnit,
          packSize: input.packSize?.trim() || null,
          barcode: cleanBarcode,
          hsn: input.hsn?.trim() || null,
          gstRateBp,
          mrp: mrpPaise,
          salePrice: salePricePaise,
          ...(purchasePricePaise !== undefined ? { purchasePrice: purchasePricePaise } : {}),
          rxRequired: input.rxRequired,
          schedule: input.schedule,
          isActive: input.isActive,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.medicines.id, input.medicineId), eq(schema.medicines.tenantId, ctx.tenantId)));

      let convertedBatches = 0;
      if (input.convertExistingBatches && input.unitsPerPack !== existing.unitsPerPack) {
        const oldUpp = Math.max(1, existing.unitsPerPack);
        const newUpp = input.unitsPerPack;
        const storeBatches = await tx
          .select()
          .from(schema.batches)
          .where(
            and(
              eq(schema.batches.tenantId, ctx.tenantId),
              eq(schema.batches.storeId, ctx.storeId),
              eq(schema.batches.medicineId, input.medicineId),
            ),
          );

        for (const b of storeBatches) {
          const targetQty = Math.round((b.qtyOnHand * newUpp) / oldUpp);
          const qtyDelta = targetQty - b.qtyOnHand;
          const adjustedPtr = Math.round((b.purchaseRate * oldUpp) / newUpp);

          if (qtyDelta !== 0) {
            await recordStockMovement({
              tx,
              tenantId: ctx.tenantId,
              storeId: ctx.storeId,
              batchId: b.id,
              medicineId: input.medicineId,
              type: "adjustment",
              qtyChange: qtyDelta,
              unitCost: adjustedPtr > 0 ? adjustedPtr : null,
              refType: "medicine_pack_conversion",
              note: `Pack conversion: ${oldUpp} → ${newUpp} ${cleanLooseUnit}s/${cleanPackUnit}`,
              userId: ctx.userId,
            });
          }

          await tx
            .update(schema.batches)
            .set({ purchaseRate: adjustedPtr, updatedAt: new Date() })
            .where(eq(schema.batches.id, b.id));
          convertedBatches++;
        }
      }

      if (formData.has("rackId")) {
        await tx
          .insert(schema.storeMedicineSettings)
          .values({
            tenantId: ctx.tenantId,
            storeId: ctx.storeId,
            medicineId: input.medicineId,
            rackId,
          })
          .onConflictDoUpdate({
            target: [schema.storeMedicineSettings.storeId, schema.storeMedicineSettings.medicineId],
            set: { rackId, updatedAt: new Date() },
          });
      }

      await writeAudit(tx, ctx, {
        action: "update",
        entityType: "medicine",
        entityId: input.medicineId,
        oldValue: {
          name: existing.name,
          unitsPerPack: existing.unitsPerPack,
          packUnit: existing.packUnit,
          looseUnit: existing.looseUnit,
          mrp: existing.mrp,
          salePrice: existing.salePrice,
          gstRateBp: existing.gstRateBp,
          isActive: existing.isActive,
        },
        newValue: {
          name: input.name,
          unitsPerPack: input.unitsPerPack,
          packUnit: cleanPackUnit,
          looseUnit: cleanLooseUnit,
          mrp: mrpPaise,
          salePrice: salePricePaise,
          gstRateBp,
          isActive: input.isActive,
          convertedBatches,
        },
        reason: "Updated medicine details",
      });
    });

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/batches");
    revalidatePath("/dashboard/sales/pos");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err: unknown) {
    if ((err instanceof Error ? err.message : String(err))?.includes("medicines_tenant_barcode_uq")) {
      return { error: "A medicine with this barcode already exists." };
    }
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to update medicine" };
  }
}

export async function getStoreStockTotalsByMedicine(
  medicineIds: string[]
): Promise<Record<string, number>> {
  const ctx = await requirePermission("medicine.view");
  if (medicineIds.length === 0) return {};

  const rows = await db
    .select({
      medicineId: schema.batches.medicineId,
      totalQty: sql<number>`COALESCE(SUM(${schema.batches.qtyOnHand}), 0)::int`,
    })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.tenantId, ctx.tenantId),
        eq(schema.batches.storeId, ctx.storeId),
        inArray(schema.batches.medicineId, medicineIds)
      )
    )
    .groupBy(schema.batches.medicineId);

  const map: Record<string, number> = {};
  for (const r of rows) {
    map[r.medicineId] = r.totalQty;
  }
  return map;
}

const BulkPackUpdateSchema = z.object({
  convertExistingBatches: z.boolean().default(false),
  items: z
    .array(
      z.object({
        medicineId: z.string().uuid(),
        unitsPerPack: z.number().int().min(1).max(1000),
        packUnit: z.string().trim().min(1),
        looseUnit: z.string().trim().min(1),
        packSize: z.string().trim().optional(),
      })
    )
    .min(1, "Select at least one medicine to update."),
});

export async function bulkUpdateMedicinePackaging(payload: z.input<typeof BulkPackUpdateSchema>) {
  const auth = await checkPermission("medicine.manage");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  const parsed = BulkPackUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid bulk pack update data." };
  }

  const { items, convertExistingBatches } = parsed.data;
  if (convertExistingBatches && !can(ctx, "inventory.adjust")) {
    return { error: "Forbidden: inventory.adjust permission required to convert batch stock." };
  }

  try {
    const result = await db.transaction(async (tx) => {
      let updatedMedicines = 0;
      let convertedBatches = 0;

      for (const item of items) {
        const [existing] = await tx
          .select({
            id: schema.medicines.id,
            unitsPerPack: schema.medicines.unitsPerPack,
            packUnit: schema.medicines.packUnit,
            looseUnit: schema.medicines.looseUnit,
          })
          .from(schema.medicines)
          .where(
            and(
              eq(schema.medicines.id, item.medicineId),
              eq(schema.medicines.tenantId, ctx.tenantId)
            )
          )
          .limit(1);

        if (!existing) continue;

        const oldUpp = Math.max(1, existing.unitsPerPack);
        const newUpp = item.unitsPerPack;
        const cleanPackSize = item.packSize?.trim() || `${newUpp}'s`;

        await tx
          .update(schema.medicines)
          .set({
            unitsPerPack: newUpp,
            packUnit: item.packUnit,
            looseUnit: item.looseUnit,
            packSize: cleanPackSize,
            updatedAt: new Date(),
          })
          .where(eq(schema.medicines.id, existing.id));

        updatedMedicines++;

        if (convertExistingBatches && newUpp !== oldUpp) {
          const storeBatches = await tx
            .select()
            .from(schema.batches)
            .where(
              and(
                eq(schema.batches.tenantId, ctx.tenantId),
                eq(schema.batches.storeId, ctx.storeId),
                eq(schema.batches.medicineId, existing.id)
              )
            );

          for (const b of storeBatches) {
            const targetQty = Math.round((b.qtyOnHand * newUpp) / oldUpp);
            const qtyDelta = targetQty - b.qtyOnHand;
            const adjustedPtr = Math.round((b.purchaseRate * oldUpp) / newUpp);

            if (qtyDelta !== 0) {
              await recordStockMovement({
                tx,
                tenantId: ctx.tenantId,
                storeId: ctx.storeId,
                batchId: b.id,
                medicineId: existing.id,
                type: "adjustment",
                qtyChange: qtyDelta,
                unitCost: adjustedPtr > 0 ? adjustedPtr : null,
                refType: "medicine_pack_conversion",
                note: `Bulk pack conversion: ${oldUpp} → ${newUpp} ${item.looseUnit}s/${item.packUnit}`,
                userId: ctx.userId,
              });
            }

            await tx
              .update(schema.batches)
              .set({ purchaseRate: adjustedPtr, updatedAt: new Date() })
              .where(eq(schema.batches.id, b.id));
            convertedBatches++;
          }
        }
      }

      await writeAudit(tx, ctx, {
        action: "update",
        entityType: "medicine",
        newValue: {
          source: "bulk_pack_updater",
          updatedMedicines,
          convertedBatches,
          convertExistingBatches,
        },
        reason: "Bulk updated medicine pack sizes",
      });

      return { updatedMedicines, convertedBatches };
    });

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/batches");
    revalidatePath("/dashboard/sales/pos");
    revalidatePath("/dashboard");
    return { success: true, ...result };
  } catch (err: unknown) {
    return {
      error: (err instanceof Error ? err.message : String(err)) || "Failed to bulk update pack sizes",
    };
  }
}
