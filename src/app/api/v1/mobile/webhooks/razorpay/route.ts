import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { ingestRazorpayWebhook } from "@/server/domain/mobile/payments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";
    const tenantIdHeader = req.headers.get("x-mediflow-tenant-id");

    // In production multi-tenant routing, tenant is resolved via custom header or webhook secret mapping
    let tenantId = tenantIdHeader;
    if (!tenantId) {
      try {
        const parsed = JSON.parse(rawBody);
        const notes = parsed.payload?.payment?.entity?.notes || parsed.payment?.entity?.notes;
        tenantId = notes?.tenant_id;
      } catch {}
    }

    if (!tenantId) {
      // Fallback to primary tenant if not in payload notes
      const firstTenant = await db.query.tenants.findFirst();
      tenantId = firstTenant?.id || "";
    }

    const result = await ingestRazorpayWebhook(db, {
      tenantId,
      rawBody,
      signature,
    });

    return NextResponse.json({ status: "ok", result }, { status: 200 });
  } catch (err: unknown) {
    const msg = (err as Error)?.message || "Internal server error";
    if (msg.includes("INVALID_WEBHOOK_SIGNATURE")) {
      return NextResponse.json({ status: "error", error: "INVALID_SIGNATURE" }, { status: 400 });
    }
    // Return 200 with error log for unprocessable bodies to prevent continuous webhook hammering
    return NextResponse.json({ status: "error_logged", error: msg }, { status: 200 });
  }
}
