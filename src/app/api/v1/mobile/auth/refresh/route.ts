import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { refreshMobileSession } from "@/server/domain/mobile/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { refreshToken } = body;

    if (!refreshToken || typeof refreshToken !== "string") {
      return NextResponse.json(
        { success: false, error: "MISSING_REFRESH_TOKEN", message: "refreshToken is required" },
        { status: 400 },
      );
    }

    const result = await refreshMobileSession(db, { refreshToken });
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Internal server error";
    if (msg.includes("TOKEN_REUSE_DETECTED")) {
      return NextResponse.json({ success: false, error: "TOKEN_REUSE_DETECTED", message: msg }, { status: 401 });
    }
    if (msg.includes("SESSION_REVOKED_OR_EXPIRED")) {
      return NextResponse.json({ success: false, error: "SESSION_REVOKED_OR_EXPIRED", message: msg }, { status: 401 });
    }
    if (msg.includes("DEVICE_NOT_ENROLLED_OR_REVOKED")) {
      return NextResponse.json({ success: false, error: "DEVICE_REVOKED", message: msg }, { status: 403 });
    }
    if (msg.includes("INVALID_REFRESH_TOKEN")) {
      return NextResponse.json({ success: false, error: "INVALID_REFRESH_TOKEN", message: "Refresh token not found or invalid" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: msg }, { status: 500 });
  }
}
