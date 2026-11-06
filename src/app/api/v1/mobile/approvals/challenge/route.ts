import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { issueApprovalChallenge } from "@/server/domain/mobile/approvals";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin"],
    });
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json({ success: false, error: "INVALID_REQUEST", message: "requestId required" }, { status: 400 });
    }

    const challenge = await issueApprovalChallenge(db, {
      tenantId: auth.context.tenantId,
      requestId,
      approverUserId: auth.context.userId,
      deviceId: auth.context.deviceId,
      sessionId: auth.context.sessionId,
    });

    return NextResponse.json({ success: true, data: challenge }, { status: 201 });
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Internal server error";
    if (msg.includes("SELF_APPROVAL_PROHIBITED")) {
      return NextResponse.json({ success: false, error: "SELF_APPROVAL_PROHIBITED", message: msg }, { status: 403 });
    }
    if (msg.includes("REQUEST_NOT_FOUND") || msg.includes("REQUEST_NOT_PENDING") || msg.includes("REQUEST_EXPIRED")) {
      return NextResponse.json({ success: false, error: "INVALID_STATE", message: msg }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: msg }, { status: 500 });
  }
}
