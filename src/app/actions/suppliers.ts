 "use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, ilike, or, sql } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";
import { revalidatePath } from "next/cache";
import { writeAudit } from "@/server/audit";
import { protectedAction } from "@/server/action";
import {
  getSupplierLedger,
  recordSupplierPayment,
  getOpenSupplierInvoices,
  RecordSupplierPaymentSchema,
} from "@/server/domain/suppliers";

export async function getSuppliersCount(searchQuery?: string): Promise<number> {
  const ctx = await requirePermission("supplier.view");
  const conditions = [eq(schema.suppliers.tenantId, ctx.tenantId)];

  if (searchQuery?.trim()) {
    const q = `%${searchQuery.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(schema.suppliers.name, q),
        ilike(schema.suppliers.phone, q),
        ilike(schema.suppliers.gstin, q),
        ilike(schema.suppliers.contactPerson, q)
      )!
    );
  }

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.suppliers)
    .where(and(...conditions));

  return row?.count ?? 0;
}

export async function getSuppliers(searchQuery?: string, limit = 50, offset = 0) {
  const ctx = await requirePermission("supplier.view");
  const conditions = [eq(schema.suppliers.tenantId, ctx.tenantId)];

  if (searchQuery?.trim()) {
    const q = `%${searchQuery.trim().toLowerCase()}%`;
    conditions.push(
      or(
        ilike(schema.suppliers.name, q),
        ilike(schema.suppliers.phone, q),
        ilike(schema.suppliers.gstin, q),
        ilike(schema.suppliers.contactPerson, q)
      )!
    );
  }

  return db
    .select()
    .from(schema.suppliers)
    .where(and(...conditions))
    .orderBy(desc(schema.suppliers.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getSupplierById(supplierId: string) {
  const ctx = await requirePermission("supplier.view");

  const [supplier] = await db
    .select()
    .from(schema.suppliers)
    .where(and(eq(schema.suppliers.id, supplierId), eq(schema.suppliers.tenantId, ctx.tenantId)))
    .limit(1);

  return supplier || null;
}

export async function createSupplier(formData: FormData) {
  const ctx = await requirePermission("supplier.manage");

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

  if (!name?.trim()) return { error: "Name is required" };

  const creditDays = creditDaysStr ? parseInt(creditDaysStr, 10) : 30;
  const leadTimeDays = leadTimeDaysStr ? parseInt(leadTimeDaysStr, 10) : 2;
  const openingBalance = openingBalanceStr ? Math.round(parseFloat(openingBalanceStr) * 100) : 0;

  try {
    const [supplier] = await db
      .insert(schema.suppliers)
      .values({
        tenantId: ctx.tenantId,
        name: name.trim(),
        contactPerson: contactPerson?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        gstin: gstin?.trim().toUpperCase() || null,
        stateCode: stateCode?.trim() || null,
        drugLicenseNo: drugLicenseNo?.trim() || null,
        creditDays,
        leadTimeDays,
        openingBalance,
        isActive: true,
      })
      .returning();

    await writeAudit(db, ctx, {
      action: "create",
      entityType: "supplier",
      entityId: supplier.id,
      newValue: { name: supplier.name, gstin: supplier.gstin, phone: supplier.phone },
    });

    revalidatePath("/dashboard/suppliers");
    return { success: true, supplierId: supplier.id };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create supplier" };
  }
}

export async function updateSupplier(supplierId: string, formData: FormData) {
  const ctx = await requirePermission("supplier.manage");

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
  const isActive = formData.get("isActive") === "on";

  if (!name?.trim()) return { error: "Name is required" };

  const creditDays = creditDaysStr ? parseInt(creditDaysStr, 10) : 30;
  const leadTimeDays = leadTimeDaysStr ? parseInt(leadTimeDaysStr, 10) : 2;

  try {
    const [existing] = await db
      .select()
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.id, supplierId), eq(schema.suppliers.tenantId, ctx.tenantId)))
      .limit(1);

    if (!existing) return { error: "Supplier not found" };

    const [updated] = await db
      .update(schema.suppliers)
      .set({
        name: name.trim(),
        contactPerson: contactPerson?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        gstin: gstin?.trim().toUpperCase() || null,
        stateCode: stateCode?.trim() || null,
        drugLicenseNo: drugLicenseNo?.trim() || null,
        creditDays,
        leadTimeDays,
        isActive,
      })
      .where(and(eq(schema.suppliers.id, supplierId), eq(schema.suppliers.tenantId, ctx.tenantId)))
      .returning();

    await writeAudit(db, ctx, {
      action: "update",
      entityType: "supplier",
      entityId: supplierId,
      oldValue: { name: existing.name, gstin: existing.gstin, isActive: existing.isActive },
      newValue: { name: updated.name, gstin: updated.gstin, isActive: updated.isActive },
    });

    revalidatePath("/dashboard/suppliers");
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to update supplier" };
  }
}


export async function getSupplierLedgerAction(
  supplierId: string,
  options?: { startDate?: string; endDate?: string }
) {
  const ctx = await requirePermission("supplier.view");
  return getSupplierLedger(db, ctx.tenantId, supplierId, options);
}

export async function getOpenSupplierInvoicesAction(supplierId: string) {
  const ctx = await requirePermission("supplier.view");
  return getOpenSupplierInvoices(db, ctx.tenantId, supplierId);
}

export const recordSupplierPaymentAction = protectedAction("accounting.post")
  .schema(RecordSupplierPaymentSchema)
  .action(async ({ parsedInput, ctx }) => {
    const payment = await db.transaction(async (tx) => {
      return recordSupplierPayment(tx, ctx, parsedInput);
    });

    revalidatePath(`/dashboard/suppliers/${parsedInput.supplierId}`);
    revalidatePath(`/dashboard/suppliers`);
    revalidatePath(`/dashboard/accounting`);

    return {
      success: true,
      paymentId: payment.id,
      paymentNo: payment.paymentNo,
    };
  });
