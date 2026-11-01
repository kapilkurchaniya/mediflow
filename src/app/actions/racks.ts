"use server";

import { z } from "zod";
import { db, schema } from "@/server/db";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { protectedAction } from "@/server/action";
import { requirePermission } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { isUniqueViolation } from "@/server/db/errors";
import { updateStoreMedicineSettings } from "@/server/domain/catalog/store-settings";

/**
 * Reference implementation of the action pattern (docs/06-coding-standards.md):
 *   permission check -> validated input -> ids from `ctx` (never from the client) -> tenant/store-scoped queries.
 * Client code reads results with `actionError(res)` from "@/lib/action-result" and data from `res.data`.
 */

const idSchema = z.string().uuid();

const RackFields = z.object({
  code: z.string().trim().min(1, "Rack code is required (e.g. R1-S2)").max(20),
  name: z.string().trim().min(1, "Rack name is required (e.g. Front Counter Shelf)").max(80),
  description: z.string().trim().max(200).optional(),
});

function revalidateRackPages() {
  revalidatePath("/dashboard/settings/racks");
  revalidatePath("/dashboard/inventory");
  revalidatePath("/dashboard/sales/pos");
}

/** Read: called from Server Components and from a client form, so it stays a plain function. */
export async function getRacks() {
  const ctx = await requirePermission("medicine.view");

  return db
    .select({
      id: schema.racks.id,
      code: schema.racks.code,
      name: schema.racks.name,
      description: schema.racks.description,
      isActive: schema.racks.isActive,
      createdAt: schema.racks.createdAt,
      medicineCount: sql<number>`count(distinct coalesce(${schema.storeMedicineSettings.medicineId}, ${schema.medicines.id}))::int`,
    })
    .from(schema.racks)
    .leftJoin(
      schema.storeMedicineSettings,
      and(
        eq(schema.racks.id, schema.storeMedicineSettings.rackId),
        eq(schema.storeMedicineSettings.storeId, ctx.storeId),
        eq(schema.storeMedicineSettings.tenantId, ctx.tenantId),
      ),
    )
    .leftJoin(
      schema.medicines,
      and(
        eq(schema.racks.id, schema.medicines.rackId),
        eq(schema.medicines.tenantId, ctx.tenantId),
      ),
    )
    .where(and(eq(schema.racks.tenantId, ctx.tenantId), eq(schema.racks.storeId, ctx.storeId)))
    .groupBy(schema.racks.id)
    .orderBy(schema.racks.code);
}

/** The rack must belong to the caller's tenant AND store, otherwise it does not exist as far as they know. */
async function findOwnRack(ctx: { tenantId: string; storeId: string }, id: string) {
  const [rack] = await db
    .select({ id: schema.racks.id })
    .from(schema.racks)
    .where(and(eq(schema.racks.id, id), eq(schema.racks.tenantId, ctx.tenantId), eq(schema.racks.storeId, ctx.storeId)))
    .limit(1);
  if (!rack) throw new DomainError("NOT_FOUND", "Rack not found.");
  return rack;
}

function rethrowDuplicateCode(err: unknown, code: string): never {
  if (isUniqueViolation(err, "racks_store_code_uq")) {
    throw new DomainError("RACK_CODE_EXISTS", `Rack code '${code.toUpperCase()}' already exists in this store.`);
  }
  throw err;
}

export const createRack = protectedAction("medicine.manage")
  .inputSchema(RackFields)
  .action(async ({ parsedInput: data, ctx }) => {
    try {
      const [rack] = await db
        .insert(schema.racks)
        .values({
          tenantId: ctx.tenantId,
          storeId: ctx.storeId,
          code: data.code.toUpperCase(),
          name: data.name,
          description: data.description || null,
          isActive: true,
        })
        .returning();
      revalidateRackPages();
      return { rack };
    } catch (err) {
      rethrowDuplicateCode(err, data.code);
    }
  });

export const updateRack = protectedAction("medicine.manage")
  .inputSchema(RackFields.extend({ id: idSchema, isActive: z.boolean().optional() }))
  .action(async ({ parsedInput: data, ctx }) => {
    await findOwnRack(ctx, data.id);
    try {
      const [rack] = await db
        .update(schema.racks)
        .set({
          code: data.code.toUpperCase(),
          name: data.name,
          description: data.description || null,
          isActive: data.isActive ?? true,
        })
        .where(and(eq(schema.racks.id, data.id), eq(schema.racks.tenantId, ctx.tenantId), eq(schema.racks.storeId, ctx.storeId)))
        .returning();
      revalidateRackPages();
      return { rack };
    } catch (err) {
      rethrowDuplicateCode(err, data.code);
    }
  });

export const deleteRack = protectedAction("medicine.manage")
  .inputSchema(z.object({ id: idSchema }))
  .action(async ({ parsedInput: { id }, ctx }) => {
    await findOwnRack(ctx, id);

    await db.transaction(async (tx) => {
      // Unlink the medicines in this rack for this store in store_medicine_settings
      await tx
        .update(schema.storeMedicineSettings)
        .set({ rackId: null, updatedAt: new Date() })
        .where(
          and(
            eq(schema.storeMedicineSettings.rackId, id),
            eq(schema.storeMedicineSettings.tenantId, ctx.tenantId),
            eq(schema.storeMedicineSettings.storeId, ctx.storeId),
          ),
        );
      // Legacy fallback: unlink medicines.rackId if pointing to this rack
      await tx
        .update(schema.medicines)
        .set({ rackId: null })
        .where(and(eq(schema.medicines.rackId, id), eq(schema.medicines.tenantId, ctx.tenantId)));
      await tx
        .delete(schema.racks)
        .where(and(eq(schema.racks.id, id), eq(schema.racks.tenantId, ctx.tenantId), eq(schema.racks.storeId, ctx.storeId)));
    });

    revalidatePath("/dashboard/settings/racks");
    revalidatePath("/dashboard/inventory");
    return { deleted: true };
  });

export const assignMedicineToRack = protectedAction("medicine.manage")
  .inputSchema(z.object({ medicineId: idSchema, rackId: idSchema.nullable() }))
  .action(async ({ parsedInput: { medicineId, rackId }, ctx }) => {
    await db.transaction(async (tx) => {
      await updateStoreMedicineSettings(tx, ctx, ctx.storeId, medicineId, { rackId });

      // Maintain legacy medicines.rackId for backwards compatibility
      await tx
        .update(schema.medicines)
        .set({ rackId })
        .where(and(eq(schema.medicines.id, medicineId), eq(schema.medicines.tenantId, ctx.tenantId)));
    });

    revalidatePath("/dashboard/inventory");
    revalidatePath("/dashboard/sales/pos");
    return { assigned: true };
  });
