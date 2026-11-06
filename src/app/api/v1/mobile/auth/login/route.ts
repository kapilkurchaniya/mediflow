import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { loginMobile } from "@/server/domain/mobile/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, deviceUuid, deviceName, platform, pushToken } = body;

    if (!email || !password || !deviceUuid || !deviceName || !platform) {
      return NextResponse.json(
        { success: false, error: "MISSING_REQUIRED_FIELDS", message: "email, password, deviceUuid, deviceName, and platform are required" },
        { status: 400 },
      );
    }

    if (!["ios", "android"].includes(platform)) {
      return NextResponse.json({ success: false, error: "INVALID_PLATFORM", message: "platform must be 'ios' or 'android'" }, { status: 400 });
    }

    const result = await loginMobile(db, { email, password, deviceUuid, deviceName, platform, pushToken });
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Internal server error";
    if (msg.includes("INVALID_CREDENTIALS")) {
      return NextResponse.json({ success: false, error: "INVALID_CREDENTIALS", message: "Invalid email or password" }, { status: 401 });
    }
    if (msg.includes("DEVICE_PENDING_ENROLLMENT")) {
      return NextResponse.json({ success: false, error: "DEVICE_PENDING_ENROLLMENT", message: msg }, { status: 403 });
    }
    if (msg.includes("DEVICE_REVOKED")) {
      return NextResponse.json({ success: false, error: "DEVICE_REVOKED", message: msg }, { status: 403 });
    }
    if (msg.includes("MEMBERSHIP_INACTIVE")) {
      return NextResponse.json({ success: false, error: "MEMBERSHIP_INACTIVE", message: "Account membership is suspended or inactive" }, { status: 403 });
    }
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: msg }, { status: 500 });
  }
}
