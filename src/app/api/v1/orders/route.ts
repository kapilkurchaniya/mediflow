import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/server/db";
import { eq, and, desc } from "drizzle-orm";
import { authenticateApiKey, apiError } from "@/server/api-auth";
import { createExternalOrderForTenant } from "@/app/actions/external-orders";

// ── Input schema ─────────────────────────────────────────────────────────────

const orderItemSchema = z.object({
  medicineId: z.string().uuid("medicineId must be a UUID"),
  name: z.string().min(1, "item name required"),
  qty: z.number().int().positive("qty must be a positive integer"),
  rate: z.number().int().nonnegative("rate must be in paise (non-negative integer)"),
});

const createOrderSchema = z.object({
  customerName: z.string().min(1, "customerName required"),
  customerPhone: z.string().min(10, "customerPhone required"),
  items: z.array(orderItemSchema).min(1, "at least one item required"),
  totalAmountPaise: z.number().int().nonnegative().default(0),
  source: z.string().optional().default("api"),
  notes: z.string().optional(),
});

// ── POST /api/v1/orders ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth
  let auth: Awaited<ReturnType<typeof authenticateApiKey>>;
  try {
    auth = await authenticateApiKey(req, "orders.write");
  } catch (e) {
    return apiError(e);
  }

  // Parse + validate body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // tenantId comes from the verified API key — NOT from the request body
  const res = await createExternalOrderForTenant(auth.tenantId, auth.storeId, parsed.data);
  if (res.error) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }

  return NextResponse.json({ success: true, order: res.order }, { status: 201 });
}

// ── GET /api/v1/orders?id=<uuid> ─────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth
  let auth: Awaited<ReturnType<typeof authenticateApiKey>>;
  try {
    auth = await authenticateApiKey(req, "orders.read");
  } catch (e) {
    return apiError(e);
  }

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("id");

  if (orderId) {
    // Single order lookup — must belong to the key's tenant
    const [order] = await db
      .select({
        id: schema.externalOrders.id,
        orderNo: schema.externalOrders.orderNo,
        status: schema.externalOrders.status,
        customerName: schema.externalOrders.customerName,
        customerPhone: schema.externalOrders.customerPhone,
        totalAmount: schema.externalOrders.totalAmount,
        source: schema.externalOrders.source,
        createdAt: schema.externalOrders.createdAt,
      })
      .from(schema.externalOrders)
      .where(
        and(
          eq(schema.externalOrders.id, orderId),
          eq(schema.externalOrders.tenantId, auth.tenantId),
        ),
      )
      .limit(1);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    return NextResponse.json({ order });
  }

  // List recent orders for the tenant (+ optional store filter)
  const conditions = [eq(schema.externalOrders.tenantId, auth.tenantId)];
  if (auth.storeId) {
    conditions.push(eq(schema.externalOrders.storeId, auth.storeId));
  }

  const orders = await db
    .select({
      id: schema.externalOrders.id,
      orderNo: schema.externalOrders.orderNo,
      status: schema.externalOrders.status,
      customerName: schema.externalOrders.customerName,
      totalAmount: schema.externalOrders.totalAmount,
      createdAt: schema.externalOrders.createdAt,
    })
    .from(schema.externalOrders)
    .where(and(...conditions))
    .orderBy(desc(schema.externalOrders.createdAt))
    .limit(50);

  return NextResponse.json({ orders });
}
