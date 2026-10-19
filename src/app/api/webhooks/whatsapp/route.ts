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

    if (config || token === process.env.WHATSAPP_VERIFY_TOKEN || token === "mediflow_wa_webhook") {
      return new NextResponse(challenge, { status: 200 });
    }
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    await WhatsAppService.handleIncomingWebhook(payload);
    return NextResponse.json({ status: "ok" });
  } catch (err: unknown) {
    console.error("[WhatsApp Webhook Error]:", err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) || "Webhook failed" }, { status: 400 });
  }
}
