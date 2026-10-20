"use server";

import { db, schema } from "@/server/db";
import { eq, ilike, and, desc, or } from "drizzle-orm";
import { getCurrentSession, requireAuth } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { extractStateCodeFromGstin } from "@/server/domain/gst";

export async function getCustomers(searchQuery?: string, limit = 50) {
  const { session } = await requireAuth();

  const conditions = [eq(schema.customers.tenantId, session.tenantId)];

  if (searchQuery?.trim()) {
    const q = `%${searchQuery.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(schema.customers.name, q),
        ilike(schema.customers.phone, q),
        ilike(schema.customers.email, q)
      )!
    );
  }

  return db
    .select()
    .from(schema.customers)
    .where(and(...conditions))
    .orderBy(desc(schema.customers.createdAt))
    .limit(limit);
}

export async function createQuickCustomer(name: string, phone?: string) {
  const { session } = await requireAuth();
  if (!name?.trim()) return { error: "Name is required" };

  try {
    const [customer] = await db
      .insert(schema.customers)
      .values({
        tenantId: session.tenantId,
        name: name.trim(),
        phone: phone?.trim() || null,
        isActive: true,
      })
      .returning({ id: schema.customers.id, name: schema.customers.name, phone: schema.customers.phone });

    revalidatePath("/dashboard/customers");
    return { success: true, customer };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create customer" };
  }
}


export async function createCustomer(formData: FormData) {
  const { session } = await requireAuth();

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const email = formData.get("email") as string;
  const address = formData.get("address") as string;
  const gstin = formData.get("gstin") as string;
  const rawStateCode = formData.get("stateCode") as string;
  const stateCode = (gstin ? extractStateCodeFromGstin(gstin) : null) || rawStateCode || null;
  const creditLimitStr = formData.get("creditLimit") as string;
  const notes = formData.get("notes") as string;

  if (!name) return { error: "Name is required" };

  // Parse credit limit to integer paise (multiply by 100)
  const creditLimit = creditLimitStr ? Math.round(parseFloat(creditLimitStr) * 100) : 0;

  try {
    await db.insert(schema.customers).values({
      tenantId: session.tenantId,
      name,
      phone: phone || null,
      email: email || null,
      address: address || null,
      gstin: gstin || null,
      stateCode: stateCode || null,
      creditLimit,
      notes: notes || null,
      isActive: true,
    });

    revalidatePath("/dashboard/customers");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create customer" };
  }
}

export async function updateCustomer(id: string, formData: FormData) {
  const { session } = await requireAuth();

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const email = formData.get("email") as string;
  const address = formData.get("address") as string;
  const gstin = formData.get("gstin") as string;
  const rawStateCode = formData.get("stateCode") as string;
  const stateCode = (gstin ? extractStateCodeFromGstin(gstin) : null) || rawStateCode || null;
  const creditLimitStr = formData.get("creditLimit") as string;
  const notes = formData.get("notes") as string;
  const isActive = formData.get("isActive") === "on";

  if (!name) return { error: "Name is required" };

  const creditLimit = creditLimitStr ? Math.round(parseFloat(creditLimitStr) * 100) : 0;

  try {
    await db
      .update(schema.customers)
      .set({
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
        gstin: gstin || null,
        stateCode: stateCode || null,
        creditLimit,
        notes: notes || null,
        isActive,
      })
      .where(and(eq(schema.customers.id, id), eq(schema.customers.tenantId, session.tenantId)));

    revalidatePath("/dashboard/customers");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to update customer" };
  }
}
