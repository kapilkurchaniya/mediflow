import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { WhatsAppService } from "@/server/domain/whatsapp";
import { getSmsProvider } from "@/server/domain/sms";
import { ConsentService } from "@/server/domain/privacy";

export async function handleReminderSend(event: {
  tenantId: string;
  payload: Record<string, unknown>;
}) {
  const reminderId = typeof event.payload.reminderId === "string" ? event.payload.reminderId : undefined;
  if (!reminderId) throw new Error("Missing reminderId in reminder.send payload");

  const [reminder] = await db
    .select()
    .from(schema.reminders)
    .where(eq(schema.reminders.id, reminderId))
    .limit(1);

  if (!reminder) throw new Error(`Reminder ${reminderId} not found`);
  if (reminder.status === "sent" || reminder.status === "cancelled") {
    return; // Already processed
  }

  // DPDP Consent Gatekeeper: Check if customer has granted consent for reminders
  if (reminder.customerId) {
    const hasConsent = await ConsentService.hasConsent(event.tenantId, reminder.customerId, "reminders");
    if (!hasConsent) {
      await db
        .update(schema.reminders)
        .set({
          status: "cancelled",
        })
        .where(eq(schema.reminders.id, reminderId));
      return; // Do not dispatch to patients without active DPDP reminder consent
    }
  }

  if (reminder.channel === "whatsapp") {
    const res = await WhatsAppService.sendMessage({
      tenantId: event.tenantId,
      customerPhone: reminder.customerPhone,
      messageBody: reminder.message,
      messageType: "text",
    });
    if (!res.success && res.status === "failed") {
      throw new Error(res.error || "WhatsApp reminder dispatch failed");
    }
  } else {
    const provider = await getSmsProvider(event.tenantId);
    const res = await provider.sendSms(reminder.customerPhone, reminder.message);
    if (!res.success) {
      throw new Error(res.error || "SMS reminder dispatch failed");
    }
  }

  await db
    .update(schema.reminders)
    .set({
      status: "sent",
      sentAt: new Date(),
    })
    .where(eq(schema.reminders.id, reminderId));
}
