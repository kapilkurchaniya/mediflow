 import { getSmsProvider } from "@/server/domain/sms";

export async function handleSmsSend(event: {
  tenantId: string;
  payload: Record<string, unknown>;
}) {
  const phone = typeof event.payload.phone === "string" ? event.payload.phone : "";
  const message = typeof event.payload.message === "string" ? event.payload.message : "";
  if (!phone || !message) throw new Error("Missing phone or message in sms.send payload");

  const provider = await getSmsProvider(event.tenantId);
  const res = await provider.sendSms(phone, message);

  if (!res.success) {
    throw new Error(res.error || "SMS dispatch failed");
  }
}
