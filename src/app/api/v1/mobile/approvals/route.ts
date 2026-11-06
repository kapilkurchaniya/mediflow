import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { listPendingApprovals, createApprovalRequest } from "@/server/domain/mobile/approvals";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin"],
    });
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId") || undefined;

    const items = await listPendingApprovals(db, {
      tenantId: auth.context.tenantId,
      storeId,
      approverUserId: auth.context.userId,
    });

    return NextResponse.json({ success: true, data: items }, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: (err as Error)?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req);
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { storeId, requestType, refId, payload, ttlHours } = body;

    if (!storeId || !requestType || !refId || !payload) {
      return NextResponse.json({ success: false, error: "INVALID_REQUEST", message: "storeId, requestType, refId, payload required" }, { status: 400 });
    }

    const created = await createApprovalRequest(db, {
      tenantId: auth.context.tenantId,
      storeId,
      requestType,
      refId,
      requestedBy: auth.context.userId,
      payload,
      ttlHours,
    });

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: (err as Error)?.message }, { status: 500 });
  }
}
