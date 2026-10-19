"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { revalidatePath } from "next/cache";

export async function getMedicalReps() {
  const { session } = await requireAuth();

  return db
    .select()
    .from(schema.medicalReps)
    .where(eq(schema.medicalReps.tenantId, session.tenantId))
    .orderBy(schema.medicalReps.name);
}

export async function createMedicalRep(formData: FormData) {
  const { session } = await requireAuth();

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const email = formData.get("email") as string;
  const companyName = formData.get("companyName") as string;
  const ratePctStr = (formData.get("commissionRatePct") as string) || "2";

  if (!name?.trim()) return { error: "Representative name is required" };

  const ratePct = parseFloat(ratePctStr);
  const commissionRateBp = isNaN(ratePct) ? 0 : Math.round(ratePct * 100);

  try {
    const [rep] = await db
      .insert(schema.medicalReps)
      .values({
        tenantId: session.tenantId,
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        companyName: companyName?.trim() || null,
        commissionRateBp,
        isActive: true,
      })
      .returning();

    revalidatePath("/dashboard/settings/medical-reps");
    revalidatePath("/dashboard/reports/commissions");
    return { success: true, rep };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create medical rep" };
  }
}

export async function toggleMedicalRepStatus(id: string, currentActive: boolean) {
  const { session } = await requireAuth();

  try {
    await db
      .update(schema.medicalReps)
      .set({ isActive: !currentActive })
      .where(and(eq(schema.medicalReps.id, id), eq(schema.medicalReps.tenantId, session.tenantId)));

    revalidatePath("/dashboard/settings/medical-reps");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to update status" };
  }
}

export async function getCommissionReport(filters?: {
  repId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const { session } = await requireAuth();

  const conditions = [
    eq(schema.sales.tenantId, session.tenantId),
    eq(schema.sales.status, "completed"),
    sql`${schema.sales.medicalRepId} IS NOT NULL`,
  ];

  if (filters?.repId && filters.repId !== "all") {
    conditions.push(eq(schema.sales.medicalRepId, filters.repId));
  }

  if (filters?.fromDate) {
    conditions.push(gte(schema.sales.createdAt, new Date(filters.fromDate)));
  }

  if (filters?.toDate) {
    const to = new Date(filters.toDate);
    to.setHours(23, 59, 59, 999);
    conditions.push(lte(schema.sales.createdAt, to));
  }

  const rows = await db
    .select({
      saleId: schema.sales.id,
      invoiceNo: schema.sales.invoiceNo,
      totalAmount: schema.sales.totalAmount,
      doctorName: schema.sales.doctorName,
      customerName: schema.sales.customerName,
      createdAt: schema.sales.createdAt,
      repId: schema.medicalReps.id,
      repName: schema.medicalReps.name,
      companyName: schema.medicalReps.companyName,
      commissionRateBp: schema.medicalReps.commissionRateBp,
    })
    .from(schema.sales)
    .innerJoin(schema.medicalReps, eq(schema.sales.medicalRepId, schema.medicalReps.id))
    .where(and(...conditions))
    .orderBy(desc(schema.sales.createdAt));

  // Compute commissions
  const salesWithCommission = rows.map((r) => {
    const salesAmountPaise = r.totalAmount || 0;
    const commissionPaise = Math.round((salesAmountPaise * r.commissionRateBp) / 10000);
    return {
      ...r,
      commissionPaise,
    };
  });

  return salesWithCommission;
}
