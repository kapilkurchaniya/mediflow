"use server";

import { db, schema } from "@/server/db";
import { eq, desc, ilike, or } from "drizzle-orm";
import { getCurrentSession } from "@/server/auth";
import { revalidatePath } from "next/cache";

// --- Categories ---

export async function getCategories() {
  const { session } = await getCurrentSession();
  if (!session?.tenantId) throw new Error("Unauthorized");

  return db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.tenantId, session.tenantId))
    .orderBy(schema.categories.name);
}

export async function createCategory(name: string) {
  const { session } = await getCurrentSession();
  if (!session?.tenantId) throw new Error("Unauthorized");

  try {
    const [category] = await db
      .insert(schema.categories)
      .values({
        tenantId: session.tenantId,
        name,
      })
      .returning();
    return { success: true, category };
  } catch (err: any) {
    return { error: err.message || "Failed to create category" };
  }
}

// --- Manufacturers ---

export async function getManufacturers() {
  const { session } = await getCurrentSession();
  if (!session?.tenantId) throw new Error("Unauthorized");

  return db
    .select()
    .from(schema.manufacturers)
    .where(eq(schema.manufacturers.tenantId, session.tenantId))
    .orderBy(schema.manufacturers.name);
}

export async function createManufacturer(name: string) {
  const { session } = await getCurrentSession();
  if (!session?.tenantId) throw new Error("Unauthorized");

  try {
    const [manufacturer] = await db
      .insert(schema.manufacturers)
      .values({
        tenantId: session.tenantId,
        name,
      })
      .returning();
    return { success: true, manufacturer };
  } catch (err: any) {
    return { error: err.message || "Failed to create manufacturer" };
  }
}

// --- Medicines ---

export async function getMedicines(searchQuery?: string) {
  const { session } = await getCurrentSession();
  if (!session?.tenantId) throw new Error("Unauthorized");

  let query = db
    .select({
      medicine: schema.medicines,
      manufacturer: schema.manufacturers,
      category: schema.categories,
    })
    .from(schema.medicines)
    .leftJoin(schema.manufacturers, eq(schema.medicines.manufacturerId, schema.manufacturers.id))
    .leftJoin(schema.categories, eq(schema.medicines.categoryId, schema.categories.id))
    .where(eq(schema.medicines.tenantId, session.tenantId))
    .orderBy(desc(schema.medicines.createdAt));

  const results = await query;

  if (searchQuery) {
    const lowerQuery = searchQuery.toLowerCase();
    // basic filter, in a real app this would use the `pg_trgm` indexes with SQL conditions
    return results.filter(
      (row) =>
        row.medicine.name.toLowerCase().includes(lowerQuery) ||
        (row.medicine.genericName && row.medicine.genericName.toLowerCase().includes(lowerQuery)) ||
        (row.medicine.barcode && row.medicine.barcode.toLowerCase().includes(lowerQuery))
    );
  }

  return results;
}

export async function createMedicine(formData: FormData) {
  const { session } = await getCurrentSession();
  if (!session?.tenantId) throw new Error("Unauthorized");

  const name = formData.get("name") as string;
  const genericName = formData.get("genericName") as string;
  const manufacturerId = formData.get("manufacturerId") as string;
  const categoryId = formData.get("categoryId") as string;
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
  const gstRateBp = gstRateBpStr ? Math.round(parseFloat(gstRateBpStr) * 100) : 1200; // default 12%
  const mrp = mrpStr ? Math.round(parseFloat(mrpStr) * 100) : 0;
  const salePrice = salePriceStr ? Math.round(parseFloat(salePriceStr) * 100) : mrp; // fallback to mrp

  try {
    await db.insert(schema.medicines).values({
      tenantId: session.tenantId,
      name,
      genericName: genericName || null,
      manufacturerId: manufacturerId || null,
      categoryId: categoryId || null,
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
    });

    revalidatePath("/dashboard/inventory");
    return { success: true };
  } catch (err: any) {
    if (err.message?.includes("medicines_tenant_barcode_uq")) {
      return { error: "A medicine with this barcode already exists." };
    }
    return { error: err.message || "Failed to create medicine" };
  }
}
