import { WhatsAppService } from "@/server/domain/whatsapp";

export async function handleWhatsAppPaymentReminder(event: {
  tenantId: string;
  payload: Record<string, unknown>;
}) {
  const customerPhone = typeof event.payload.phone === "string" ? event.payload.phone : undefined;
  const customerId = typeof event.payload.customerId === "string" ? event.payload.customerId : undefined;
  const messageBody = typeof event.payload.message === "string" ? event.payload.message : undefined;

  if (!customerPhone || !messageBody) {
    throw new Error("Missing phone or message in whatsapp.payment_reminder payload");
  }

  const res = await WhatsAppService.sendMessage({
    tenantId: event.tenantId,
    customerPhone,
    customerId,
    messageBody,
    messageType: "text",
  });

  if (!res.success && res.status === "failed") {
    throw new Error(res.error || "WhatsApp payment reminder dispatch failed");
  }
}
