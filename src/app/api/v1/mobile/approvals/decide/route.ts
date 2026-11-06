import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { decideApproval } from "@/server/domain/mobile/approvals";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin"],
    });
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { requestId, challengeId, challengeToken, decision, decisionReason, idempotencyKey } = body;

    if (!requestId || !challengeId || !challengeToken || !decision || !idempotencyKey) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "requestId, challengeId, challengeToken, decision, idempotencyKey required" },
        { status: 400 },
      );
    }

    if (!["approved", "rejected"].includes(decision)) {
      return NextResponse.json({ success: false, error: "INVALID_DECISION", message: "decision must be 'approved' or 'rejected'" }, { status: 400 });
    }

    const result = await decideApproval(db, {
      tenantId: auth.context.tenantId,
      requestId,
      challengeId,
      challengeToken,
      approverUserId: auth.context.userId,
      deviceId: auth.context.deviceId,
      sessionId: auth.context.sessionId,
      decision,
      decisionReason,
      idempotencyKey,
    });

    return NextResponse.json({ success: true, data: result.decision, replayed: result.replayed }, { status: 200 });
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Internal server error";
    if (msg.includes("SELF_APPROVAL_PROHIBITED")) {
      return NextResponse.json({ success: false, error: "SELF_APPROVAL_PROHIBITED", message: msg }, { status: 403 });
    }
    if (msg.includes("CHALLENGE_SESSION_MISMATCH") || msg.includes("CHALLENGE_ACTOR_MISMATCH")) {
      return NextResponse.json({ success: false, error: "CHALLENGE_SESSION_MISMATCH", message: msg }, { status: 403 });
    }
    if (msg.includes("INVALID_CHALLENGE_TOKEN") || msg.includes("CHALLENGE_ALREADY_CONSUMED") || msg.includes("CHALLENGE_EXPIRED")) {
      return NextResponse.json({ success: false, error: "INVALID_CHALLENGE", message: msg }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: msg }, { status: 500 });
  }
}
