import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { requireMobileAuth } from "@/server/domain/mobile/middleware";
import { completeProofUpload } from "@/server/domain/mobile/delivery";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireMobileAuth(req, {
      allowedRoles: ["owner", "manager", "admin", "delivery_staff"],
    });
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { proofId, fileBase64, fileType } = body;

    if (!proofId || !fileBase64 || !fileType) {
      return NextResponse.json(
        { success: false, error: "INVALID_REQUEST", message: "proofId, fileBase64, and fileType required" },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(fileBase64, "base64");
    const result = await completeProofUpload(db, {
      tenantId: auth.context.tenantId,
      proofId,
      fileBuffer,
      fileSizeBytes: fileBuffer.length,
      fileType,
      actorUserId: auth.context.userId,
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Internal server error";
    if (msg.includes("MIME_MAGIC_MISMATCH") || msg.includes("INVALID_FILE_SIZE")) {
      return NextResponse.json({ success: false, error: "VALIDATION_FAILED", message: msg }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: msg }, { status: 500 });
  }
}
