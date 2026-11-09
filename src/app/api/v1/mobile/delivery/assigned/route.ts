import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { listAssignedDeliveries } from "@/server/domain/mobile/delivery";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin", "delivery_staff"],
    });
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId") || undefined;
    const isManager = ["owner", "manager", "admin"].includes(auth.context.role);

    const items = await listAssignedDeliveries(db, {
      tenantId: auth.context.tenantId,
      storeId,
      deliveryStaffUserId: auth.context.userId,
      isManager,
    });

    return NextResponse.json({ success: true, data: items }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: (err as Error)?.message }, { status: 500 });
  }
}
