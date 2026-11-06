import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { sha256, validateMobileToken } from "@/server/domain/mobile/auth";
import { mobileSessions } from "@/server/db/schema/mobile";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {}

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const auth = await validateMobileToken(db, token);
      if (auth.valid) {
        await db
          .update(mobileSessions)
          .set({ revokedAt: new Date() })
          .where(and(eq(mobileSessions.tenantId, auth.context.tenantId), eq(mobileSessions.id, auth.context.sessionId)));
        return NextResponse.json({ success: true, message: "Session revoked successfully" }, { status: 200 });
      }
    }

    if (body.refreshToken && typeof body.refreshToken === "string") {
      const tokenHash = sha256(body.refreshToken);
      await db
        .update(mobileSessions)
        .set({ revokedAt: new Date() })
        .where(eq(mobileSessions.refreshTokenHash, tokenHash));
      return NextResponse.json({ success: true, message: "Session revoked successfully" }, { status: 200 });
    }

    return NextResponse.json({ success: false, error: "UNAUTHORIZED", message: "Missing valid authorization token or refreshToken" }, { status: 401 });
  } catch (err: unknown) {
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: (err as Error)?.message || "Internal server error" }, { status: 500 });
  }
}
