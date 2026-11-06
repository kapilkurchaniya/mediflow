import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { approveDevice, revokeDevice, validateMobileToken } from "@/server/domain/mobile/auth";
import { mobileDevices } from "@/server/db/schema/mobile";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const token = authHeader.slice(7).trim();
    const auth = await validateMobileToken(db, token);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    if (!["owner", "manager", "admin"].includes(auth.context.role)) {
      return NextResponse.json({ success: false, error: "FORBIDDEN", message: "Only managers/owners can manage devices" }, { status: 403 });
    }

    const devices = await db
      .select()
      .from(mobileDevices)
      .where(eq(mobileDevices.tenantId, auth.context.tenantId));

    return NextResponse.json({ success: true, data: devices }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: (err as Error)?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    }
    const token = authHeader.slice(7).trim();
    const auth = await validateMobileToken(db, token);
    if (!auth.valid) {
      return NextResponse.json({ success: false, error: auth.error }, { status: 401 });
    }

    if (!["owner", "manager", "admin"].includes(auth.context.role)) {
      return NextResponse.json({ success: false, error: "FORBIDDEN", message: "Only managers/owners can manage devices" }, { status: 403 });
    }

    const body = await req.json();
    const { deviceId, action } = body;

    if (!deviceId || !action || !["approve", "revoke"].includes(action)) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "deviceId and action ('approve' | 'revoke') required" },
        { status: 400 },
      );
    }

    if (action === "approve") {
      const updated = await approveDevice(db, auth.context.tenantId, deviceId);
      return NextResponse.json({ success: true, data: updated }, { status: 200 });
    } else {
      const updated = await revokeDevice(db, auth.context.tenantId, deviceId);
      return NextResponse.json({ success: true, data: updated }, { status: 200 });
    }
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: (err as Error)?.message }, { status: 500 });
  }
}
