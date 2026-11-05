import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { WhatsAppService } from "@/server/domain/whatsapp";
import { generateReceiptToken } from "@/lib/receipt-token";

export async function handleWhatsAppReceipt(event: {
  tenantId: string;
  payload: Record<string, unknown>;
}) {
  const saleId = typeof event.payload.saleId === "string" ? event.payload.saleId : undefined;
  if (!saleId) throw new Error("Missing saleId in whatsapp.receipt payload");

  const [sale] = await db
    .select()
    .from(schema.sales)
    .where(eq(schema.sales.id, saleId))
    .limit(1);

  if (!sale) throw new Error(`Sale ${saleId} not found`);

  let phone = sale.customerPhone;
  let customerName = sale.customerName || "Valued Customer";

  if (!phone && sale.customerId) {
    const [cust] = await db
      .select({ phone: schema.customers.phone, name: schema.customers.name })
      .from(schema.customers)
      .where(eq(schema.customers.id, sale.customerId))
      .limit(1);
    if (cust?.phone) phone = cust.phone;
    if (cust?.name) customerName = cust.name;
  }

  if (!phone) {
    // Walk-in counter sale without customer phone: no-op
    return;
  }

  // Generate cryptographically signed public receipt link
  const token = generateReceiptToken({
    saleId: sale.id,
    tenantId: event.tenantId,
    expiresInDays: 90,
  });

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.mediflow.in";
  const publicReceiptUrl = `${appBaseUrl}/r/${token}`;

  const res = await WhatsAppService.sendInvoiceReceipt({
    tenantId: event.tenantId,
    storeId: sale.storeId,
    customerPhone: phone,
    customerId: sale.customerId,
    invoiceNo: sale.invoiceNo || "INV-COUNTER",
    patientName: customerName,
    totalAmountPaise: sale.totalAmount || 0,
    publicReceiptUrl,
  });

  if (!res.success && res.status === "failed") {
    throw new Error(res.error || "WhatsApp delivery failed");
  }
}
