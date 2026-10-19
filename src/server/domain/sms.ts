import { db, schema } from "@/server/db";
import { eq, and } from "drizzle-orm";

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

export interface SmsProvider {
  sendSms(to: string, message: string): Promise<SmsSendResult>;
}

export class Msg91Provider implements SmsProvider {
  constructor(private apiKey: string, private senderId?: string) {}

  async sendSms(to: string, message: string): Promise<SmsSendResult> {
    try {
      // MSG91 API integration
      const cleanPhone = to.replace(/\D/g, "").slice(-10);
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          authkey: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: this.senderId || "MEDFLW",
          recipients: [{ mobiles: `91${cleanPhone}`, message }],
        }),
      });

      const data = await res.json();
      if (res.ok) {
        return { success: true, messageId: data.message || `msg91_${Date.now()}`, provider: "msg91" };
      }
      return { success: false, provider: "msg91", error: data.message || "MSG91 failure" };
    } catch (err: unknown) {
      return { success: false, provider: "msg91", error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export class TextLocalProvider implements SmsProvider {
  constructor(private apiKey: string, private senderId?: string) {}

  async sendSms(to: string, message: string): Promise<SmsSendResult> {
    try {
      const cleanPhone = to.replace(/\D/g, "").slice(-10);
      const params = new URLSearchParams({
        apikey: this.apiKey,
        numbers: `91${cleanPhone}`,
        sender: this.senderId || "TXTLCL",
        message: encodeURIComponent(message),
      });

      const res = await fetch(`https://api.textlocal.in/send/?${params.toString()}`);
      const data = await res.json();

      if (data.status === "success") {
        return { success: true, messageId: String(data.batch_id || Date.now()), provider: "textlocal" };
      }
      return { success: false, provider: "textlocal", error: data.errors?.[0]?.message || "TextLocal error" };
    } catch (err: unknown) {
      return { success: false, provider: "textlocal", error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export class MockSmsProvider implements SmsProvider {
  async sendSms(to: string, message: string): Promise<SmsSendResult> {
    console.log(`[SMS Simulator] Sent to ${to}: "${message}"`);
    return {
      success: true,
      messageId: `mock_sms_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      provider: "simulator",
    };
  }
}

export async function getSmsProvider(tenantId: string): Promise<SmsProvider> {
  const [config] = await db
    .select()
    .from(schema.smsConfigs)
    .where(and(eq(schema.smsConfigs.tenantId, tenantId), eq(schema.smsConfigs.isActive, true)))
    .limit(1);

  if (!config || !config.apiKey) {
    return new MockSmsProvider();
  }

  if (config.provider === "msg91") {
    return new Msg91Provider(config.apiKey, config.senderId || undefined);
  } else if (config.provider === "textlocal") {
    return new TextLocalProvider(config.apiKey, config.senderId || undefined);
  }

  return new MockSmsProvider();
}
