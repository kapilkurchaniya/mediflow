"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { revalidatePath } from "next/cache";

export async function getPromiseOrders(filters?: { status?: string }) {
  const { session } = await requireAuth();

  const conditions = [
    eq(schema.promiseOrders.tenantId, session.tenantId),
    eq(schema.promiseOrders.storeId, session.storeId!),
  ];

  if (filters?.status && filters.status !== "all") {
    conditions.push(eq(schema.promiseOrders.status, filters.status));
  }

  const list = await db
    .select({
      id: schema.promiseOrders.id,
      customerName: schema.promiseOrders.customerName,
      customerPhone: schema.promiseOrders.customerPhone,
      medicineId: schema.promiseOrders.medicineId,
      medicineName: schema.promiseOrders.medicineName,
      qtyRequested: schema.promiseOrders.qtyRequested,
      status: schema.promiseOrders.status,
      saleId: schema.promiseOrders.saleId,
      purchaseOrderId: schema.promiseOrders.purchaseOrderId,
      notes: schema.promiseOrders.notes,
      promisedDate: schema.promiseOrders.promisedDate,
      createdAt: schema.promiseOrders.createdAt,
      customerId: schema.promiseOrders.customerId,
      rackCode: schema.racks.code,
    })
    .from(schema.promiseOrders)
    .leftJoin(schema.medicines, eq(schema.promiseOrders.medicineId, schema.medicines.id))
    .leftJoin(schema.racks, eq(schema.medicines.rackId, schema.racks.id))
    .where(and(...conditions))
    .orderBy(desc(schema.promiseOrders.createdAt));

  return list;
}

export async function createPromiseOrder(data: {
  customerName: string;
  customerPhone: string;
  medicineId: string;
  medicineName?: string;
  qtyRequested: number;
  notes?: string;
  promisedDate?: string;
  customerId?: string | null;
}) {
  const { session, user } = await requireAuth();

  if (!data.customerName?.trim()) return { error: "Customer name is required" };
  if (!data.customerPhone?.trim()) return { error: "Customer phone is required" };
  if (!data.medicineId) return { error: "Medicine is required" };
  if (!data.qtyRequested || data.qtyRequested < 1) return { error: "Quantity must be at least 1" };

  try {
    let effectiveMedName = data.medicineName?.trim();
    if (!effectiveMedName) {
      const [med] = await db
        .select({ name: schema.medicines.name })
        .from(schema.medicines)
        .where(eq(schema.medicines.id, data.medicineId));
      effectiveMedName = med?.name || "Medicine";
    }

    const [order] = await db
      .insert(schema.promiseOrders)
      .values({
        tenantId: session.tenantId,
        storeId: session.storeId!,
        customerId: data.customerId || null,
        customerName: data.customerName.trim(),
        customerPhone: data.customerPhone.trim(),
        medicineId: data.medicineId,
        medicineName: effectiveMedName,
        qtyRequested: data.qtyRequested,
        status: "pending",
        notes: data.notes?.trim() || null,
        promisedDate: data.promisedDate || null,
        createdBy: user.id,
      })
      .returning();

    revalidatePath("/dashboard/sales/promise-orders");
    revalidatePath("/dashboard/purchases");
    return { success: true, order };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updatePromiseOrderStatus(
  id: string,
  status: "pending" | "ordered" | "fulfilled" | "cancelled",
  options?: {
    saleId?: string;
    purchaseOrderId?: string;
  }
) {
  const { session } = await requireAuth();

  try {
    const updateValues: Record<string, unknown> = { status };
    if (options?.saleId) updateValues.saleId = options.saleId;
    if (options?.purchaseOrderId) updateValues.purchaseOrderId = options.purchaseOrderId;

    const [updated] = await db
      .update(schema.promiseOrders)
      .set(updateValues)
      .where(
        and(
          eq(schema.promiseOrders.id, id),
          eq(schema.promiseOrders.tenantId, session.tenantId),
          eq(schema.promiseOrders.storeId, session.storeId!)
        )
      )
      .returning();

    revalidatePath("/dashboard/sales/promise-orders");
    return { success: true, order: updated };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
