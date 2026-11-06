import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { initiateProofUpload } from "@/server/domain/mobile/delivery";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin", "delivery_staff"],
    });
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { deliveryOrderId, proofType, fileType, idempotencyKey } = body;

    if (!deliveryOrderId || !proofType || !fileType || !idempotencyKey) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "deliveryOrderId, proofType, fileType, idempotencyKey required" },
        { status: 400 },
      );
    }

    if (!["delivery_photo", "recipient_signature"].includes(proofType)) {
      return NextResponse.json({ success: false, error: "INVALID_PROOF_TYPE" }, { status: 400 });
    }

    if (!["image/jpeg", "image/png", "application/pdf"].includes(fileType)) {
      return NextResponse.json({ success: false, error: "INVALID_FILE_TYPE" }, { status: 400 });
    }

    const result = await initiateProofUpload(db, {
      tenantId: auth.context.tenantId,
      deliveryOrderId,
      proofType,
      fileType,
      uploadedBy: auth.context.userId,
      idempotencyKey,
    });

    return NextResponse.json({ success: true, data: result.proof, replayed: result.replayed }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: (err as Error)?.message }, { status: 500 });
  }
}
