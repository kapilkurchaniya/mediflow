"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { revalidatePath } from "next/cache";

export async function getExternalOrders(statusFilter?: string) {
  const { session } = await requireAuth();

  const conditions = [eq(schema.externalOrders.tenantId, session.tenantId)];

  if (statusFilter && statusFilter !== "all") {
    conditions.push(eq(schema.externalOrders.status, statusFilter));
  }

  return db
    .select()
    .from(schema.externalOrders)
    .where(and(...conditions))
    .orderBy(desc(schema.externalOrders.createdAt))
    .limit(100);
}

export async function getOrderById(orderId: string) {
  const { session } = await requireAuth();

  const [order] = await db
    .select()
    .from(schema.externalOrders)
    .where(and(eq(schema.externalOrders.id, orderId), eq(schema.externalOrders.tenantId, session.tenantId)))
    .limit(1);

  return order || null;
}

export async function updateOrderStatus(orderId: string, status: string) {
  const { session } = await requireAuth();

  try {
    await db
      .update(schema.externalOrders)
      .set({ status })
      .where(and(eq(schema.externalOrders.id, orderId), eq(schema.externalOrders.tenantId, session.tenantId)));

    revalidatePath("/dashboard/orders");
    revalidatePath(`/dashboard/orders/${orderId}`);
    return { success: true };
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to update order status" };
  }
}

export async function createExternalOrder(data: {
  source: string;
  customerName: string;
  customerPhone: string;
  items: Array<{ medicineId: string; name: string; qty: number; rate: number }>;
  totalAmountPaise: number;
  notes?: string;
  tenantId?: string;
  storeId?: string;
}) {
  const cleanPhone = data.customerPhone.replace(/\D/g, "").slice(-10);
  const orderNo = `ORD-${Date.now().toString().slice(-6)}`;

  let tenantId = data.tenantId;
  let storeId = data.storeId;

  if (!tenantId) {
    const auth = await requireAuth();
    tenantId = auth.session.tenantId;
    storeId = auth.session.storeId;
  }

  // Lookup existing customer
  const [cust] = await db
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.phone, cleanPhone)))
    .limit(1);

  const [order] = await db
    .insert(schema.externalOrders)
    .values({
      tenantId,
      storeId: storeId || null,
      source: data.source || "whatsapp",
      orderNo,
      customerId: cust?.id || null,
      customerName: data.customerName.trim(),
      customerPhone: cleanPhone,
      status: "received",
      items: data.items,
      totalAmount: data.totalAmountPaise,
      notes: data.notes?.trim() || null,
    })
    .returning();

  revalidatePath("/dashboard/orders");
  return { success: true, order };
}
