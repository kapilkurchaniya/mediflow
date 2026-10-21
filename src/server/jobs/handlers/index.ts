import type { OutboxType } from "../outbox";
import { handleWhatsAppReceipt } from "./whatsapp-receipt";
import { handleSmsSend } from "./sms-send";
import { handleReminderSend } from "./reminder-send";
import { handleGstDocRetry } from "./gst-doc-retry";
import { handleEInvoiceGenerate } from "./einvoice-generate";

export const handlers: Record<
  OutboxType,
  (event: { tenantId: string; payload: any }) => Promise<void>
> = {
  "whatsapp.receipt": handleWhatsAppReceipt,
  "sms.send": handleSmsSend,
  "reminder.send": handleReminderSend,
  "gst.doc_retry": handleGstDocRetry,
  "einvoice.generate": handleEInvoiceGenerate,
};
