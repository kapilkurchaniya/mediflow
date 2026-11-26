export function normalizeWhatsAppPhone(phone: string, defaultCountryCode = "91"): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${defaultCountryCode}${digits}`;
  }
  return digits;
}

/**
 * Generates a WhatsApp deep link (`whatsapp://send` for desktop app or `https://wa.me/` for web)
 * as a zero-config fallback when Meta Cloud API is not configured (L1).
 */
export function buildWhatsAppDeepLink(params: {
  phone: string;
  text: string;
  preferDesktop?: boolean;
}): string {
  const normalizedPhone = normalizeWhatsAppPhone(params.phone);
  const encodedText = encodeURIComponent(params.text);
  if (params.preferDesktop) {
    return `whatsapp://send?phone=${normalizedPhone}&text=${encodedText}`;
  }
  return `https://wa.me/${normalizedPhone}?text=${encodedText}`;
}
