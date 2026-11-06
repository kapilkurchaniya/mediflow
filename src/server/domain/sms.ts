import { db, schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import { decryptSecret } from "@/server/crypto";

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  provider: string;
  error?: string;
}

export interface SendSmsParams {
  to: string;
  message: string;
  dltTemplateId?: string;
  senderId?: string;
  entityId?: string;
}

export function resolveSendParams(
  toOrParams: string | SendSmsParams,
  message?: string,
  options?: { dltTemplateId?: string; senderId?: string; entityId?: string }
): SendSmsParams {
  if (typeof toOrParams === "object" && toOrParams !== null) {
    return toOrParams;
  }
  return {
    to: toOrParams,
    message: message ?? "",
    dltTemplateId: options?.dltTemplateId,
    senderId: options?.senderId,
    entityId: options?.entityId,
  };
}

export interface SmsProvider {
  sendSms(
    toOrParams: string | SendSmsParams,
    message?: string,
    options?: { dltTemplateId?: string; senderId?: string; entityId?: string }
  ): Promise<SmsSendResult>;
}

export class Msg91Provider implements SmsProvider {
  constructor(private apiKey: string, private senderId?: string) {}

  async sendSms(
    toOrParams: string | SendSmsParams,
    message?: string,
    options?: { dltTemplateId?: string; senderId?: string; entityId?: string }
  ): Promise<SmsSendResult> {
    const params = resolveSendParams(toOrParams, message, options);
    try {
      // MSG91 API integration
      const cleanPhone = params.to.replace(/\D/g, "").slice(-10);
      const sender = params.senderId || this.senderId || "MEDFLW";
      const payload: Record<string, unknown> = {
        sender,
        recipients: [{ mobiles: `91${cleanPhone}`, message: params.message }],
      };
      if (params.dltTemplateId) {
        payload.template_id = params.dltTemplateId;
        payload.dlt_te_id = params.dltTemplateId;
      }

      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: {
          authkey: this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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

  async sendSms(
    toOrParams: string | SendSmsParams,
    message?: string,
    options?: { dltTemplateId?: string; senderId?: string; entityId?: string }
  ): Promise<SmsSendResult> {
    const params = resolveSendParams(toOrParams, message, options);
    try {
      const cleanPhone = params.to.replace(/\D/g, "").slice(-10);
      const sender = params.senderId || this.senderId || "TXTLCL";
      const queryParams = new URLSearchParams({
        apikey: this.apiKey,
        numbers: `91${cleanPhone}`,
        sender,
        message: encodeURIComponent(params.message),
      });
      if (params.dltTemplateId) {
        queryParams.set("custom", params.dltTemplateId);
        queryParams.set("dlt_template_id", params.dltTemplateId);
      }

      const res = await fetch(`https://api.textlocal.in/send/?${queryParams.toString()}`);
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
  async sendSms(
    toOrParams: string | SendSmsParams,
    message?: string,
    options?: { dltTemplateId?: string; senderId?: string; entityId?: string }
  ): Promise<SmsSendResult> {
    const params = resolveSendParams(toOrParams, message, options);
    console.log(
      `[SMS Simulator] Sent to ${params.to} (Sender: ${params.senderId || "DEFAULT"}, DLT: ${params.dltTemplateId || "NONE"}): "${params.message}"`
    );
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

  // Decrypt the stored key — may be legacy plaintext or "v1:" ciphertext.
  const plainApiKey = decryptSecret(config.apiKey) ?? "";

  if (config.provider === "msg91") {
    return new Msg91Provider(plainApiKey, config.senderId || undefined);
  } else if (config.provider === "textlocal") {
    return new TextLocalProvider(plainApiKey, config.senderId || undefined);
  }

  return new MockSmsProvider();
}

// Re-export DLT domain modules
export * from "./sms/dlt-validator";
export * from "./sms/dlt-service";
