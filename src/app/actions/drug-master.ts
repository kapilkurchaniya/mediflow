"use server";

import { ilike, or } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";

export async function searchDrugMasterAction(query: string, limit = 25) {
  await requirePermission("medicine.view");
  const q = `%${query.trim()}%`;
  if (q === "%%") {
    return db.select().from(schema.drugMaster).limit(limit);
  }
  return db
    .select()
    .from(schema.drugMaster)
    .where(or(ilike(schema.drugMaster.brandName, q), ilike(schema.drugMaster.genericName, q)))
    .limit(limit);
}

export async function upsertDrugMasterEntryAction(input: {
  brandName: string;
  genericName: string;
  manufacturer?: string;
  hsn?: string;
  gstRateBp?: number;
  schedule?: string;
  packSize?: string;
  mrpPaise?: number;
}) {
  await requirePermission("medicine.manage");
  const [inserted] = await db
    .insert(schema.drugMaster)
    .values({
      brandName: input.brandName.trim(),
      genericName: input.genericName.trim(),
      manufacturer: input.manufacturer?.trim() || null,
      hsn: input.hsn?.trim() || "30049099",
      gstRateBp: input.gstRateBp ?? 1200,
      schedule: input.schedule ?? "none",
      packSize: input.packSize?.trim() || null,
      mrpPaise: input.mrpPaise ?? null,
    })
    .returning();
  return inserted;
}
