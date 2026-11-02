"use server";

import { db, schema } from "@/server/db";
import { eq, ilike, and, desc, or, sql } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { extractStateCodeFromGstin } from "@/server/domain/gst";
import { LoyaltyService } from "@/server/domain/loyalty";

export async function getCustomersCount(searchQuery?: string): Promise<number> {
  const ctx = await requirePermission("customer.view");
  const conditions = [eq(schema.customers.tenantId, ctx.tenantId)];

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

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.customers)
    .where(and(...conditions));

  return row?.count ?? 0;
}

export async function getCustomers(searchQuery?: string, limit = 50, offset = 0) {
  const ctx = await requirePermission("customer.view");

  const conditions = [eq(schema.customers.tenantId, ctx.tenantId)];

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
    .limit(limit)
    .offset(offset);
}

export async function createQuickCustomer(name: string, phone?: string) {
  const ctx = await requirePermission("customer.manage");
  if (!name?.trim()) return { error: "Name is required" };

  try {
    const [customer] = await db
      .insert(schema.customers)
      .values({
        tenantId: ctx.tenantId,
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
  const ctx = await requirePermission("customer.manage");

  const name = formData.get("name") as string;
  const phone = formData.get("phone") as string;
  const email = formData.get("email") as string;
  const address = formData.get("address") as string;
  const gstin = formData.get("gstin") as string;
  const rawStateCode = formData.get("stateCode") as string;
  const stateCode = (gstin ? extractStateCodeFromGstin(gstin) : null) || rawStateCode || null;
  const creditLimitStr = formData.get("creditLimit") as string;
  const notes = formData.get("notes") as string;

  if (!name?.trim()) return { error: "Name is required" };

  // Parse credit limit to integer paise (multiply by 100)
  const creditLimit = creditLimitStr ? Math.round(parseFloat(creditLimitStr) * 100) : 0;

  try {
    const [customer] = await db
      .insert(schema.customers)
      .values({
        tenantId: ctx.tenantId,
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        gstin: gstin?.trim().toUpperCase() || null,
        stateCode: stateCode || null,
        creditLimit,
        notes: notes?.trim() || null,
        isActive: true,
      })
      .returning();

    revalidatePath("/dashboard/customers");
    return { success: true, customerId: customer.id };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create customer" };
  }
}

export async function updateCustomer(id: string, formData: FormData) {
  const ctx = await requirePermission("customer.manage");

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

  if (!name?.trim()) return { error: "Name is required" };

  const creditLimit = creditLimitStr ? Math.round(parseFloat(creditLimitStr) * 100) : 0;

  try {
    await db
      .update(schema.customers)
      .set({
        name: name.trim(),
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        gstin: gstin?.trim().toUpperCase() || null,
        stateCode: stateCode || null,
        creditLimit,
        notes: notes?.trim() || null,
        isActive,
      })
      .where(and(eq(schema.customers.id, id), eq(schema.customers.tenantId, ctx.tenantId)));

    revalidatePath("/dashboard/customers");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to update customer" };
  }
}

export async function getCustomerRedeemablePoints(customerId: string) {
  const ctx = await requirePermission("customer.view");
  if (!customerId?.trim()) return { points: 0, valuePaise: 0 };
  return LoyaltyService.getRedeemable(db, ctx.tenantId, customerId.trim());
}
