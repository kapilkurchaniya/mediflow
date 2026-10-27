 import { getSmsProvider } from "@/server/domain/sms";

export async function handleSmsSend(event: {
  tenantId: string;
  payload: any;
}) {
  const { phone, message } = event.payload;
  if (!phone || !message) throw new Error("Missing phone or message in sms.send payload");

  const provider = await getSmsProvider(event.tenantId);
  const res = await provider.sendSms(phone, message);

  if (!res.success) {
    throw new Error(res.error || "SMS dispatch failed");
  }
}
