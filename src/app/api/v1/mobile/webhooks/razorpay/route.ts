import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { ingestRazorpayWebhook } from "@/server/domain/mobile/payments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature") || "";
    const tenantIdHeader = req.headers.get("x-mediflow-tenant-id");

    // Authoritatively resolve tenant from payload notes or matching payment intent
    let tenantId = "";
    try {
      const parsed = JSON.parse(rawBody);
      const paymentEntity = parsed.payload?.payment?.entity || parsed.payment?.entity;
      const qrEntity = parsed.payload?.qr_code?.entity || parsed.qr_code?.entity;
      const notes = paymentEntity?.notes || qrEntity?.notes;
      if (notes?.tenant_id) {
        tenantId = String(notes.tenant_id);
      } else {
        const orderRef = (notes?.provider_order_ref || qrEntity?.id || paymentEntity?.qr_code_id) as string;
        if (orderRef) {
          const intent = await db.query.deliveryPaymentIntents.findFirst({
            where: (t, { eq, or }) => or(eq(t.providerOrderRef, orderRef), eq(t.providerQrId, orderRef)),
          });
          if (intent) tenantId = intent.tenantId;
        }
      }
    } catch {}

    if (!tenantId) {
      return NextResponse.json({ status: "error", error: "UNRESOLVED_TENANT" }, { status: 400 });
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
    // Return retryable 500 for ingestion failures so payment provider retries delivery
    return NextResponse.json({ status: "error", error: msg }, { status: 500 });
  }
}
