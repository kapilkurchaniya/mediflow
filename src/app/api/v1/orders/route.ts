import { NextRequest, NextResponse } from "next/server";
import { createExternalOrder, getOrderById } from "@/app/actions/external-orders";
import { db, schema } from "@/server/db";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.customerPhone || !body.customerName || !body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: "Invalid order payload. customerName, customerPhone, and items array required." },
        { status: 400 }
      );
    }

    // Default to first tenant if not explicitly provided
    let tenantId = body.tenantId;
    if (!tenantId) {
      const [t] = await db.select({ id: schema.tenants.id }).from(schema.tenants).limit(1);
      tenantId = t?.id;
    }

    const res = await createExternalOrder({
      source: body.source || "eretail",
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      items: body.items,
      totalAmountPaise: body.totalAmountPaise || 0,
      notes: body.notes,
      tenantId,
    });

    if (res.error) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, order: res.order }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err instanceof Error ? err.message : String(err)) || "Order creation failed" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("id");

  if (!orderId) {
    return NextResponse.json({ error: "Missing 'id' query parameter" }, { status: 400 });
  }

  const [order] = await db
    .select({
      id: schema.externalOrders.id,
      orderNo: schema.externalOrders.orderNo,
      status: schema.externalOrders.status,
      customerName: schema.externalOrders.customerName,
      totalAmount: schema.externalOrders.totalAmount,
      createdAt: schema.externalOrders.createdAt,
    })
    .from(schema.externalOrders)
    .where(eq(schema.externalOrders.id, orderId))
    .limit(1);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ order });
}
