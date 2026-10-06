"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc } from "drizzle-orm";
import { getCurrentSession, requireAuth } from "@/server/auth";
import { revalidatePath } from "next/cache";

export async function getSuppliers(searchQuery?: string) {
  const { session } = await requireAuth();

  const query = db
    .select()
    .from(schema.suppliers)
    .where(eq(schema.suppliers.tenantId, session.tenantId))
    .orderBy(desc(schema.suppliers.createdAt));

  const results = await query;

  if (searchQuery) {
    const lowerQuery = searchQuery.toLowerCase();
    return results.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) ||
        (s.phone && s.phone.includes(lowerQuery)) ||
        (s.gstin && s.gstin.toLowerCase().includes(lowerQuery)) ||
        (s.contactPerson && s.contactPerson.toLowerCase().includes(lowerQuery))
    );
  }

  return results;
}

export async function createSupplier(formData: FormData) {
  const { session } = await requireAuth();

  const name = formData.get("name") as string;
  const contactPerson = formData.get("contactPerson") as string;
  const phone = formData.get("phone") as string;
  const email = formData.get("email") as string;
  const address = formData.get("address") as string;
  const gstin = formData.get("gstin") as string;
  const stateCode = formData.get("stateCode") as string;
  const drugLicenseNo = formData.get("drugLicenseNo") as string;
  const creditDaysStr = formData.get("creditDays") as string;
  const leadTimeDaysStr = formData.get("leadTimeDays") as string;
  const openingBalanceStr = formData.get("openingBalance") as string;

  if (!name) return { error: "Name is required" };

  const creditDays = creditDaysStr ? parseInt(creditDaysStr, 10) : 30;
  const leadTimeDays = leadTimeDaysStr ? parseInt(leadTimeDaysStr, 10) : 2;
  const openingBalance = openingBalanceStr ? Math.round(parseFloat(openingBalanceStr) * 100) : 0;

  try {
    await db.insert(schema.suppliers).values({
      tenantId: session.tenantId,
      name,
      contactPerson: contactPerson || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      gstin: gstin || null,
      stateCode: stateCode || null,
      drugLicenseNo: drugLicenseNo || null,
      creditDays,
      leadTimeDays,
      openingBalance,
      isActive: true,
    });

    revalidatePath("/dashboard/suppliers");
    return { success: true };
  } catch (err: any) {
    return { error: err.message || "Failed to create supplier" };
  }
}
