import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { transitionDeliveryOrder } from "@/server/domain/mobile/delivery";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin", "delivery_staff"],
    });
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { deliveryOrderId, toStatus, notes } = body;

    if (!deliveryOrderId || !toStatus || !["in_transit", "delivered", "failed"].includes(toStatus)) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "deliveryOrderId and valid toStatus required" },
        { status: 400 },
      );
    }

    const result = await transitionDeliveryOrder(db, {
      tenantId: auth.context.tenantId,
      deliveryOrderId,
      toStatus,
      actorUserId: auth.context.userId,
      notes,
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Internal server error";
    if (msg.includes("ILLEGAL_DELIVERY_TRANSITION") || msg.includes("PROOF_REQUIRED")) {
      return NextResponse.json({ success: false, error: "TRANSITION_REJECTED", message: msg }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: msg }, { status: 500 });
  }
}
