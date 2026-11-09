import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { createDeliveryUpiIntent } from "@/server/domain/mobile/payments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin", "delivery_staff"],
    });
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { deliveryOrderId } = body;

    if (!deliveryOrderId) {
      return NextResponse.json({ success: false, error: "INVALID_REQUEST", message: "deliveryOrderId required" }, { status: 400 });
    }

    const result = await createDeliveryUpiIntent(db, {
      tenantId: auth.context.tenantId,
      deliveryOrderId,
      actorUserId: auth.context.userId,
    });

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Internal server error";
    if (msg.includes("PAYMENT_ALREADY_VERIFIED") || msg.includes("NO_OUTSTANDING_BALANCE")) {
      return NextResponse.json({ success: false, error: "INVALID_PAYMENT_STATE", message: msg }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: msg }, { status: 500 });
  }
}
