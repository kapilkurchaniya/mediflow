"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { revalidatePath } from "next/cache";

export async function getRacks() {
  const { session } = await requireAuth();

  const racksWithCount = await db
    .select({
      id: schema.racks.id,
      code: schema.racks.code,
      name: schema.racks.name,
      description: schema.racks.description,
      isActive: schema.racks.isActive,
      createdAt: schema.racks.createdAt,
      medicineCount: sql<number>`count(${schema.medicines.id})::int`,
    })
    .from(schema.racks)
    .leftJoin(schema.medicines, eq(schema.racks.id, schema.medicines.rackId))
    .where(
      and(
        eq(schema.racks.tenantId, session.tenantId),
        eq(schema.racks.storeId, session.storeId!)
      )
    )
    .groupBy(schema.racks.id)
    .orderBy(schema.racks.code);

  return racksWithCount;
}

export async function createRack(data: {
  code: string;
  name: string;
  description?: string;
}) {
  const { session } = await requireAuth();

  if (!data.code?.trim()) return { error: "Rack code is required (e.g. R1-S2)" };
  if (!data.name?.trim()) return { error: "Rack name is required (e.g. Front Counter Shelf)" };

  try {
    const [rack] = await db
      .insert(schema.racks)
      .values({
        tenantId: session.tenantId,
        storeId: session.storeId!,
        code: data.code.trim().toUpperCase(),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        isActive: true,
      })
      .returning();

    revalidatePath("/dashboard/settings/racks");
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/sales/pos");
    return { success: true, rack };
  } catch (err: unknown) {
    if ((err instanceof Error ? err.message : String(err)).includes("racks_store_code_uq")) {
      return { error: `Rack code '${data.code.toUpperCase()}' already exists in this store.` };
    }
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateRack(
  id: string,
  data: {
    code: string;
    name: string;
    description?: string;
    isActive?: boolean;
  }
) {
  const { session } = await requireAuth();

  try {
    const [updated] = await db
      .update(schema.racks)
      .set({
        code: data.code.trim().toUpperCase(),
        name: data.name.trim(),
        description: data.description?.trim() || null,
        isActive: data.isActive ?? true,
      })
      .where(
        and(
          eq(schema.racks.id, id),
          eq(schema.racks.tenantId, session.tenantId),
          eq(schema.racks.storeId, session.storeId!)
        )
      )
      .returning();

    revalidatePath("/dashboard/settings/racks");
    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/sales/pos");
    return { success: true, rack: updated };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteRack(id: string) {
  const { session } = await requireAuth();

  // Unlink any medicines in this rack first
  await db
    .update(schema.medicines)
    .set({ rackId: null })
    .where(and(eq(schema.medicines.rackId, id), eq(schema.medicines.tenantId, session.tenantId)));

  await db
    .delete(schema.racks)
    .where(
      and(
        eq(schema.racks.id, id),
        eq(schema.racks.tenantId, session.tenantId),
        eq(schema.racks.storeId, session.storeId!)
      )
    );

  revalidatePath("/dashboard/settings/racks");
  revalidatePath("/dashboard/inventory");
  return { success: true };
}

export async function assignMedicineToRack(medicineId: string, rackId: string | null) {
  const { session } = await requireAuth();

  await db
    .update(schema.medicines)
    .set({ rackId: rackId || null })
    .where(and(eq(schema.medicines.id, medicineId), eq(schema.medicines.tenantId, session.tenantId)));

  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/sales/pos");
  return { success: true };
}
