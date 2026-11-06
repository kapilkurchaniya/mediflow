import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { collectCashForDelivery } from "@/server/domain/mobile/payments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin", "delivery_staff"],
    });
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { deliveryOrderId, amountPaise } = body;

    if (!deliveryOrderId || !amountPaise || amountPaise <= 0) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "deliveryOrderId and positive amountPaise required" },
        { status: 400 },
      );
    }

    const result = await collectCashForDelivery(db, {
      tenantId: auth.context.tenantId,
      deliveryOrderId,
      amountPaise,
      actorUserId: auth.context.userId,
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: (err as Error)?.message }, { status: 500 });
  }
}
