import type { DbOrTx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { formatINR } from "@/lib/format";
import { enqueue } from "@/server/jobs/outbox";
import type { SendPaymentReminderInput } from "./types";
import { getCustomerExposure } from "./outstanding";

/**
 * Validates customer dues and enqueues an asynchronous WhatsApp payment reminder
 * in the transactional outbox with idempotency and audit trail.
 */
export async function enqueuePaymentReminder(
  tx: DbOrTx,
  ctx: AuthCtx,
  input: SendPaymentReminderInput,
): Promise<{ eventId: string; message: string }> {
  const { customerId, phone, message: customMessage } = input;

  if (!phone || !phone.trim()) {
    throw new DomainError("INVALID_PHONE", "Customer phone number is required to send a payment reminder.");
  }

  // 1. Fetch live customer exposure to ensure balances are fresh
  const exposure = await getCustomerExposure(
    ctx.tenantId,
    customerId,
    { type: "all" },
    undefined,
    "due_date",
    tx,
  );

  if (!exposure) {
    throw new DomainError("NOT_FOUND", "Customer record not found.");
  }

  if (exposure.netExposure <= 0) {
    throw new DomainError("NO_DUES", `${exposure.customerName} has no outstanding dues to remind.`);
  }

  const invoiceCount = exposure.openInvoices?.length ?? 0;
  const invoiceNumbers = (exposure.openInvoices ?? []).map((i) => i.invoiceNo).join(", ");

  const defaultMessage = `Dear ${exposure.customerName}, this is a friendly payment reminder from your pharmacy. You have an outstanding balance of ${formatINR(exposure.netExposure)} across ${invoiceCount} bill(s) (Inv: ${invoiceNumbers}). Please clear the dues at your earliest convenience. Thank you!`;

  const finalMessage = customMessage?.trim() ? customMessage.trim() : defaultMessage;

  // 2. Enqueue in transactional outbox
  const event = await enqueue(
    tx,
    ctx.tenantId,
    "whatsapp.payment_reminder",
    {
      customerId,
      customerName: exposure.customerName,
      phone: phone.trim(),
      totalDuePaise: exposure.netExposure,
      invoiceCount,
      invoiceNumbers,
      message: finalMessage,
      sentBy: ctx.userId,
    },
  );

  const reminderEventId = String(event.id);

  // 3. Write immutable audit record
  await writeAudit(tx, ctx, {
    action: "create",
    entityType: "payment_reminder",
    entityId: reminderEventId,
    newValue: {
      customerId,
      phone,
      totalDuePaise: exposure.netExposure,
      message: finalMessage,
    },
  });

  return { eventId: reminderEventId, message: finalMessage };
}
