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

const DEFAULT_PHARMACY_CATEGORIES = [
  "Analgesic & Antipyretic",
  "Antibiotic",
  "Antidiabetic",
  "Antihistamine & Allergy",
  "Ayurvedic & Herbal",
  "Cardiovascular & BP",
  "Dermatology & Topical",
  "Gastrointestinal",
  "Neurology & CNS",
  "Ophthalmic & ENT",
  "OTC & Wellness",
  "Pediatrics",
  "Respiratory & Asthma",
  "Surgical & Medical Devices",
  "Vitamins & Supplements",
] as const;

export async function getCategories() {
  const ctx = await requirePermission("medicine.view");

  const existing = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.tenantId, ctx.tenantId))
    .orderBy(schema.categories.name);

  if (existing.length > 0) return existing;

  // Auto-seed standard Indian pharmacy therapeutic categories on first access
  await db
    .insert(schema.categories)
    .values(
      DEFAULT_PHARMACY_CATEGORIES.map((name) => ({
        tenantId: ctx.tenantId,
        name,
      }))
    )
    .onConflictDoNothing();

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

  const trimmed = name?.trim();
  if (!trimmed) return { error: "Category name is required" };

  try {
    const [existing] = await db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.tenantId, ctx.tenantId),
          sql`lower(${schema.categories.name}) = lower(${trimmed})`
        )
      )
      .limit(1);
    if (existing) {
      return { success: true, category: existing };
    }

    const [category] = await db
      .insert(schema.categories)
      .values({
        tenantId: ctx.tenantId,
        name: trimmed,
      })
      .returning();
    revalidatePath("/dashboard/inventory");
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

  const trimmed = name?.trim();
  if (!trimmed) return { error: "Manufacturer name is required" };

  try {
    const [existing] = await db
      .select()
      .from(schema.manufacturers)
      .where(
        and(
          eq(schema.manufacturers.tenantId, ctx.tenantId),
          sql`lower(${schema.manufacturers.name}) = lower(${trimmed})`
        )
      )
      .limit(1);
    if (existing) {
      return { success: true, manufacturer: existing };
    }

    const [manufacturer] = await db
      .insert(schema.manufacturers)
      .values({
        tenantId: ctx.tenantId,
        name: trimmed,
      })
      .returning();
    revalidatePath("/dashboard/inventory");
    return { success: true, manufacturer };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create manufacturer" };
  }
}

// --- Medicines ---

export type MedicinePackFilter = "all" | "single";
export type MedicineStatusFilter = "all" | "active" | "archived";

function buildMedicineSearchConditions(
  tenantId: string,
  searchQuery?: string,
  packFilter: MedicinePackFilter = "all",
  statusFilter: MedicineStatusFilter = "all"
) {
  const conditions = [eq(schema.medicines.tenantId, tenantId)];

  if (statusFilter === "active") {
    conditions.push(eq(schema.medicines.isActive, true));
  } else if (statusFilter === "archived") {
    conditions.push(eq(schema.medicines.isActive, false));
  }

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
  packFilter: MedicinePackFilter = "all",
  statusFilter: MedicineStatusFilter = "all"
): Promise<number> {
  const ctx = await requirePermission("medicine.view");
  const conditions = buildMedicineSearchConditions(ctx.tenantId, searchQuery, packFilter, statusFilter);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.medicines)
    .where(and(...conditions));

  return row?.count ?? 0;
}

export async function getMedicinesCounts(
  searchQuery?: string,
  packFilter: MedicinePackFilter = "all",
  statusFilter: MedicineStatusFilter = "all"
): Promise<{
  filteredCount: number;
  activeCount: number;
  archivedCount: number;
  singleUnitActiveCount: number;
}> {
  const ctx = await requirePermission("medicine.view");
  const baseConditions = buildMedicineSearchConditions(ctx.tenantId, searchQuery, "all", "all");

  const statusCond =
    statusFilter === "active"
      ? sql`${schema.medicines.isActive} = true`
      : statusFilter === "archived"
      ? sql`${schema.medicines.isActive} = false`
      : sql`true`;
  const packCond = packFilter === "single" ? sql`${schema.medicines.unitsPerPack} = 1` : sql`true`;

  const [row] = await db
    .select({
      filteredCount: sql<number>`count(*) filter (where ${statusCond} and ${packCond})::int`,
      activeCount: sql<number>`count(*) filter (where ${schema.medicines.isActive} = true)::int`,
      archivedCount: sql<number>`count(*) filter (where ${schema.medicines.isActive} = false)::int`,
      singleUnitActiveCount: sql<number>`count(*) filter (where ${schema.medicines.isActive} = true and ${schema.medicines.unitsPerPack} = 1)::int`,
    })
    .from(schema.medicines)
    .where(and(...baseConditions));

  return {
    filteredCount: row?.filteredCount ?? 0,
    activeCount: row?.activeCount ?? 0,
    archivedCount: row?.archivedCount ?? 0,
    singleUnitActiveCount: row?.singleUnitActiveCount ?? 0,
  };
}

export async function getMedicines(
  searchQuery?: string,
  limit = 50,
  offset = 0,
  packFilter: MedicinePackFilter = "all",
  statusFilter: MedicineStatusFilter = "all"
) {
  const ctx = await requirePermission("medicine.view");
  const conditions = buildMedicineSearchConditions(ctx.tenantId, searchQuery, packFilter, statusFilter);

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
    let createdId = "";
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
    createdId = created.id;

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
    return { success: true, id: createdId };
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

/**
 * Bans / discontinues a medicine (immediately removing it from POS and optionally
 * quarantining & zeroing all active branch stock), or permanently deletes the medicine
 * if it has never been referenced in sales, purchases, prescriptions, or registers.
 */
export async function discontinueOrDeleteMedicine(params: {
  medicineId: string;
  mode: "ban" | "delete";
  reason?: string;
  zeroOutStock?: boolean;
}): Promise<{ success?: boolean; deleted?: boolean; message?: string; error?: string }> {
  const auth = await checkPermission("medicine.manage");
  if (!auth.ok) return { error: auth.error };
  const ctx = auth.ctx;

  const shouldZeroStock = params.mode === "ban" && (params.zeroOutStock ?? true);
  if (shouldZeroStock && !can(ctx, "inventory.adjust")) {
    return { error: "You need inventory.adjust permission to zero out / recall batch stock." };
  }

  const cleanReason =
    params.reason?.trim() ||
    (params.mode === "ban"
      ? "Medicine banned / discontinued by pharmacy"
      : "Deleted unused medicine from catalog");

  try {
    const result = await db.transaction(async (tx) => {
      const [med] = await tx
        .select()
        .from(schema.medicines)
        .where(
          and(
            eq(schema.medicines.id, params.medicineId),
            eq(schema.medicines.tenantId, ctx.tenantId)
          )
        )
        .limit(1);

      if (!med) {
        throw new Error("Medicine not found.");
      }

      if (params.mode === "delete") {
        const [saleRef] = await tx
          .select({ id: schema.saleItems.id })
          .from(schema.saleItems)
          .where(eq(schema.saleItems.medicineId, med.id))
          .limit(1);
        const [purchaseRef] = await tx
          .select({ id: schema.purchaseItems.id })
          .from(schema.purchaseItems)
          .where(eq(schema.purchaseItems.medicineId, med.id))
          .limit(1);
        const [poRef] = await tx
          .select({ id: schema.purchaseOrderItems.id })
          .from(schema.purchaseOrderItems)
          .where(eq(schema.purchaseOrderItems.medicineId, med.id))
          .limit(1);
        const [rxRef] = await tx
          .select({ id: schema.prescriptionItems.id })
          .from(schema.prescriptionItems)
          .where(eq(schema.prescriptionItems.medicineId, med.id))
          .limit(1);
        const [compRef] = await tx
          .select({ id: schema.dispensingLogs.id })
          .from(schema.dispensingLogs)
          .where(eq(schema.dispensingLogs.medicineId, med.id))
          .limit(1);
        const [quarantineRef] = await tx
          .select({ id: schema.quarantineBatches.id })
          .from(schema.quarantineBatches)
          .where(eq(schema.quarantineBatches.medicineId, med.id))
          .limit(1);
        const [transferRef] = await tx
          .select({ id: schema.stockTransferItems.id })
          .from(schema.stockTransferItems)
          .where(eq(schema.stockTransferItems.medicineId, med.id))
          .limit(1);

        if (!saleRef && !purchaseRef && !poRef && !rxRef && !compRef && !quarantineRef && !transferRef) {
          await tx
            .delete(schema.stockMovements)
            .where(
              and(
                eq(schema.stockMovements.medicineId, med.id),
                eq(schema.stockMovements.tenantId, ctx.tenantId)
              )
            );
          await tx
            .delete(schema.batches)
            .where(
              and(
                eq(schema.batches.medicineId, med.id),
                eq(schema.batches.tenantId, ctx.tenantId)
              )
            );
          await tx
            .delete(schema.medicines)
            .where(eq(schema.medicines.id, med.id));

          await writeAudit(tx, ctx, {
            action: "delete",
            entityType: "medicine",
            entityId: med.id,
            oldValue: { name: med.name, schedule: med.schedule },
            reason: cleanReason,
          });

          return {
            deleted: true,
            message: `"${med.name}" and its unused batches were permanently deleted.`,
          };
        }
      }

      // Ban / Discontinue path (preserves historical invoices, GST & Form 35 registers)
      await tx
        .update(schema.medicines)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.medicines.id, med.id));

      let recalledUnits = 0;
      let heldBatches = 0;

      const storeBatches = await tx
        .select()
        .from(schema.batches)
        .where(
          and(
            eq(schema.batches.tenantId, ctx.tenantId),
            eq(schema.batches.storeId, ctx.storeId),
            eq(schema.batches.medicineId, med.id)
          )
        )
        .for("update");

      for (const b of storeBatches) {
        if (shouldZeroStock && b.qtyOnHand > 0) {
          recalledUnits += b.qtyOnHand;
          await recordStockMovement({
            tx,
            tenantId: ctx.tenantId,
            storeId: ctx.storeId,
            batchId: b.id,
            medicineId: med.id,
            type: "damage",
            qtyChange: -b.qtyOnHand,
            unitCost: b.purchaseRate > 0 ? b.purchaseRate : null,
            refType: "ban_recall",
            note: cleanReason,
            userId: ctx.userId,
          });
          await tx.insert(schema.quarantineBatches).values({
            tenantId: ctx.tenantId,
            storeId: ctx.storeId,
            batchId: b.id,
            medicineId: med.id,
            supplierId: b.supplierId,
            qty: b.qtyOnHand,
            reason: "recalled",
            status: "quarantined",
            notes: cleanReason,
            quarantinedBy: ctx.userId,
          });
        }
        await tx
          .update(schema.batches)
          .set({ status: "hold", updatedAt: new Date() })
          .where(eq(schema.batches.id, b.id));
        heldBatches++;
      }

      await writeAudit(tx, ctx, {
        action: "update",
        entityType: "medicine",
        entityId: med.id,
        oldValue: { isActive: med.isActive },
        newValue: { isActive: false, heldBatches, recalledUnits, mode: params.mode },
        reason: cleanReason,
      });

      const msg =
        params.mode === "delete"
          ? `"${med.name}" has statutory billing/ledger history so it was archived & blocked from POS instead of hard-deleted.`
          : `"${med.name}" has been banned/archived from POS${recalledUnits > 0 ? ` and ${recalledUnits} units were moved to Recall Quarantine` : ""}.`;

      return { deleted: false, message: msg };
    });

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/inventory/batches");
    revalidatePath("/dashboard/inventory/quarantine");
    revalidatePath("/dashboard/purchases/expiry-returns");
    revalidatePath("/dashboard/sales/pos");
    revalidatePath("/dashboard");
    return { success: true, ...result };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to discontinue/remove medicine" };
  }
}
