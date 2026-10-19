import { WhatsAppService } from "@/server/domain/whatsapp";
import { db, schema } from "@/server/db";

/**
 * Dispatches an automated tax invoice receipt via WhatsApp Business API
 */
export async function sendWhatsAppReceipt(
  customerPhone: string,
  invoiceNo: string,
  amount: number,
  pdfLink?: string,
  tenantId?: string
) {
  if (!customerPhone) return { success: false, error: "No phone number provided" };

  let resolvedTenantId = tenantId;
  if (!resolvedTenantId) {
    const [c] = await db.select({ tenantId: schema.whatsappConfigs.tenantId }).from(schema.whatsappConfigs).limit(1);
    resolvedTenantId = c?.tenantId || "default";
  }

  return WhatsAppService.sendInvoiceReceipt({
    tenantId: resolvedTenantId,
    customerPhone,
    invoiceNo,
    totalAmountPaise: amount,
    pdfUrl: pdfLink,
  });
}
