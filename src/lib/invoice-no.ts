/**
 * Invoice numbers look like `INV/26-27/000123`: <prefix>/<FY>/<6-digit serial>.
 * CGST Rule 46(b) caps the whole number at 16 characters, which leaves room for a 3-character prefix.
 * Pure helpers, shared by the settings form (client) and the numbering service (server).
 */
import { MAX_INVOICE_NO_LENGTH } from "./regulatory";

/** "/26-27/000123" */
export const INVOICE_NO_SUFFIX_LENGTH = "/26-27/000000".length;

export const MAX_INVOICE_PREFIX_LENGTH = MAX_INVOICE_NO_LENGTH - INVOICE_NO_SUFFIX_LENGTH;

/** Returns an error message, or null when the prefix is acceptable. */
export function validateInvoicePrefix(prefix: string): string | null {
  if (!/^[A-Z0-9]+$/.test(prefix)) return "Use only capital letters and digits for the bill prefix.";
  if (prefix.length > MAX_INVOICE_PREFIX_LENGTH) {
    return `Bill prefix can be at most ${MAX_INVOICE_PREFIX_LENGTH} characters (GST allows 16 characters in total per invoice number).`;
  }
  return null;
}
