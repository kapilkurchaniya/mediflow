"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, ilike, or } from "drizzle-orm";
import { requirePermission, checkPermission } from "@/server/rbac";
import { writeAudit } from "@/server/audit";
import { DEFAULT_GST_RATE_BP, isValidGstRateBp } from "@/lib/regulatory";
import { revalidatePath } from "next/cache";

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

export async function getMedicines(searchQuery?: string, limit = 100, offset = 0) {
  const ctx = await requirePermission("medicine.view");

  const conditions = [eq(schema.medicines.tenantId, ctx.tenantId)];

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

  return db
    .select({
      medicine: schema.medicines,
      manufacturer: schema.manufacturers,
      category: schema.categories,
      rack: schema.racks,
    })
    .from(schema.medicines)
    .leftJoin(schema.manufacturers, eq(schema.medicines.manufacturerId, schema.manufacturers.id))
    .leftJoin(schema.categories, eq(schema.medicines.categoryId, schema.categories.id))
    .leftJoin(schema.racks, eq(schema.medicines.rackId, schema.racks.id))
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

  if (!name) return { error: "Name is required" };

  // Parse decimals to integers (basis points / paise)
  const gstRateBp = gstRateBpStr ? Math.round(parseFloat(gstRateBpStr) * 100) : DEFAULT_GST_RATE_BP; // GST 2.0: 5%
  if (!isValidGstRateBp(gstRateBp)) return { error: "Choose a valid GST rate (0%, 5%, 12%, 18% or 28%)." };
  const mrp = mrpStr ? Math.round(parseFloat(mrpStr) * 100) : 0;
  const salePrice = salePriceStr ? Math.round(parseFloat(salePriceStr) * 100) : mrp; // fallback to mrp

  try {
    await db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.medicines).values({
      tenantId: ctx.tenantId,
      name,
      genericName: genericName || null,
      manufacturerId: manufacturerId || null,
      categoryId: categoryId || null,
      rackId: rackId?.trim() || null,
      unit,
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
      newValue: { name, mrp, salePrice, gstRateBp, hsn: hsn || null, schedule: schedule || "none", rxRequired },
    });
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
