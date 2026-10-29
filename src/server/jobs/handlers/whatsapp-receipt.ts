  import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { WhatsAppService } from "@/server/domain/whatsapp";

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

  const [store] = await db
    .select({ name: schema.stores.name })
    .from(schema.stores)
    .where(eq(schema.stores.id, sale.storeId))
    .limit(1);

  const storeName = store?.name || "MediFlow Pharmacy";
  const amountRupees = ((sale.totalAmount || 0) / 100).toFixed(2);

  const messageBody = `Dear ${customerName},\n\nThank you for shopping at ${storeName}!\n\nTax Invoice: #${sale.invoiceNo}\nTotal Amount: ₹${amountRupees}\nStatus: Paid\n\nWishing you good health!`;

  const res = await WhatsAppService.sendMessage({
    tenantId: event.tenantId,
    storeId: sale.storeId,
    customerPhone: phone,
    customerId: sale.customerId,
    messageBody,
    messageType: "text",
  });

  if (!res.success && res.status === "failed") {
    throw new Error(res.error || "WhatsApp delivery failed");
  }
}
