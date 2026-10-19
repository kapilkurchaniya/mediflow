import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { WhatsAppService } from "@/server/domain/whatsapp";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token) {
    // Check if verify token matches any tenant's configured token
    const [config] = await db
      .select({ verifyToken: schema.whatsappConfigs.webhookVerifyToken })
      .from(schema.whatsappConfigs)
      .where(eq(schema.whatsappConfigs.webhookVerifyToken, token))
      .limit(1);

    // NOTE: Do NOT add a hardcoded fallback token here — use WHATSAPP_VERIFY_TOKEN env var only
    if (config || token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return new NextResponse(challenge, { status: 200 });
    }
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  // Read the raw body (required for HMAC validation)
  const raw = await req.text();

  // Verify HMAC-SHA256 signature if the app secret is configured
  if (appSecret) {
    const sig = req.headers.get("x-hub-signature-256") ?? "";
    const expected =
      "sha256=" +
      crypto.createHmac("sha256", appSecret).update(raw).digest("hex");

    const sigValid =
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));

    if (!sigValid) {
      console.warn("[WhatsApp Webhook] Invalid signature — request rejected");
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  try {
    await WhatsAppService.handleIncomingWebhook(JSON.parse(raw));
    return NextResponse.json({ status: "ok" });
  } catch (err: unknown) {
    console.error("[WhatsApp Webhook Error]:", err);
    // Do NOT echo internal error messages back to callers
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 400 });
  }
}
