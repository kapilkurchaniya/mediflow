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
}) {
  // Session-based action — tenantId comes from the authenticated session only.
  const { session } = await requireAuth();
  return createExternalOrderForTenant(session.tenantId, session.storeId, data);
}

/**
 * Server-only domain function — called by /api/v1/orders after API key auth.
 * tenantId comes from the verified API key, NOT from the request body.
 * Never call this from a Server Action that accepts untrusted input.
 */
export async function createExternalOrderForTenant(
  tenantId: string,
  storeId: string | null,
  data: {
    source: string;
    customerName: string;
    customerPhone: string;
    items: Array<{ medicineId: string; name: string; qty: number; rate: number }>;
    totalAmountPaise: number;
    notes?: string;
  },
) {
  const cleanPhone = data.customerPhone.replace(/\D/g, "").slice(-10);
  const orderNo = `ORD-${Date.now().toString().slice(-6)}`;

  // Lookup existing customer
  const [cust] = await db
    .select({ id: schema.customers.id })
    .from(schema.customers)
    .where(and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.phone, cleanPhone)))
    .limit(1);

  try {
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
  } catch (err: unknown) {
    return { error: (err instanceof Error ? err.message : String(err)) || "Failed to create order" };
  }
}
