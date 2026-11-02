/**
 * Normalizes an Indian phone number (10-digit mobile, +91 prefix, 0 prefix) to international E.164 format without '+' symbol for WhatsApp URL.
 */
export function formatWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

/**
 * Builds a direct click-to-chat URL for WhatsApp Web & WhatsApp Mobile App:
 * https://wa.me/<phone>?text=<encodedText>
 */
export function buildWhatsAppDirectUrl(phone: string, text: string): string {
  const cleanPhone = formatWhatsAppPhone(phone);
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
}

/**
 * Builds a friendly, statutory digital invoice receipt message for patient WhatsApp sharing.
 */
export function buildInvoiceWhatsAppMessage({
  customerName,
  storeName,
  invoiceNo,
  totalINR,
  dateStr,
  itemCount,
}: {
  customerName?: string | null;
  storeName: string;
  invoiceNo?: string | null;
  totalINR: string;
  dateStr: string;
  itemCount?: number;
}): string {
  const name = customerName?.trim() || "Valued Customer";
  const invStr = invoiceNo ? `#${invoiceNo}` : "Receipt";
  const itemsText = itemCount !== undefined ? `\n📦 *Items Dispensed:* ${itemCount}` : "";

  return `Dear ${name},

Thank you for visiting *${storeName}*!

📋 *Tax Invoice:* ${invStr}
📅 *Date:* ${dateStr}${itemsText}
💰 *Total Amount:* ${totalINR}
✅ *Status:* Paid in full

Wishing you good health and a speedy recovery!`;
}
