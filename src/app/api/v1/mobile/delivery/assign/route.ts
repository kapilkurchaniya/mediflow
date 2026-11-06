import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { assignDeliveryOrder } from "@/server/domain/mobile/delivery";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin"],
    });
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { deliveryOrderId, targetStaffUserId } = body;

    if (!deliveryOrderId || !targetStaffUserId) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "deliveryOrderId and targetStaffUserId required" },
        { status: 400 },
      );
    }

    const result = await assignDeliveryOrder(db, {
      tenantId: auth.context.tenantId,
      deliveryOrderId,
      targetStaffUserId,
      actorUserId: auth.context.userId,
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Internal server error";
    if (msg.includes("STAFF_STORE_ACCESS_DENIED") || msg.includes("STAFF_MEMBERSHIP_SUSPENDED")) {
      return NextResponse.json({ success: false, error: "STAFF_UNAUTHORIZED", message: msg }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: msg }, { status: 500 });
  }
}
