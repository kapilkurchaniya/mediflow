import { GST_STATE_CODES } from "@/lib/regulatory";

export interface BusinessDetailsInput {
  legalName: string;
  tradeName?: string;
  gstin?: string;
  stateCode: string;
  pan?: string;
  taxScheme: "regular" | "composition";
}

export interface StoreProfileInput {
  storeId?: string;
  name: string;
  kind: "retail" | "warehouse";
  address?: string;
  city?: string;
  pincode?: string;
  phone?: string;
  form20No?: string;
  form20Expiry?: string;
  form21No?: string;
  form21Expiry?: string;
  form20bNo?: string;
  form20bExpiry?: string;
  form21bNo?: string;
  form21bExpiry?: string;
  fssaiNo?: string;
  fssaiExpiry?: string;
  invoicePrefix: string;
}

export interface StaffInviteInput {
  name: string;
  email: string;
  phone?: string;
  role: "pharmacist" | "manager" | "cashier";
  pharmacistRegNo?: string;
  pharmacistCouncilState?: string;
}

export interface OnboardingStatus {
  completed: boolean;
  currentStep: number;
  tenant: {
    id: string;
    name: string;
    legalName: string | null;
    gstin: string | null;
    stateCode: string | null;
    stateName: string | null;
    taxScheme: "regular" | "composition";
  };
  store: {
    id: string;
    name: string;
    kind: "retail" | "warehouse";
    invoicePrefix: string;
    form20No: string | null;
    form21No: string | null;
    form20bNo: string | null;
    form21bNo: string | null;
    fssaiNo: string | null;
  } | null;
  inventoryCount: number;
  staffCount: number;
}

/** Standard Indian GSTIN regex pattern (15 characters). */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Derives the 2-digit Indian state code and human-readable state name from a GSTIN.
 */
export function deriveStateFromGstin(gstin: string): {
  isValid: boolean;
  stateCode: string;
  stateName: string;
  pan: string;
} {
  const clean = gstin.trim().toUpperCase();
  if (!clean || clean.length < 2) {
    return { isValid: false, stateCode: "", stateName: "", pan: "" };
  }

  const code = clean.slice(0, 2);
  const stateName = GST_STATE_CODES[code] || "Unknown State";
  const pan = clean.length >= 12 ? clean.slice(2, 12) : "";
  const isValid = GSTIN_REGEX.test(clean);

  return { isValid, stateCode: code, stateName, pan };
}

/**
 * Validates invoice prefix according to GST Rule 46(b) of CGST Rules 2017:
 * - Maximum 16 characters for the full invoice number.
 * - Allowed characters: alphabets, numerals, and special characters '/' or '-'.
 * - Must not start with illegal punctuation.
 */
export function validateInvoicePrefix(prefix: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = prefix.trim().toUpperCase();
  if (!trimmed) {
    return { valid: false, error: "Invoice prefix is required" };
  }
  if (trimmed.length > 8) {
    return {
      valid: false,
      error: "Prefix length must not exceed 8 characters to reserve space for sequential numbers",
    };
  }
  if (!/^[A-Z0-9/-]+$/.test(trimmed)) {
    return {
      valid: false,
      error: "Only letters, numbers, hyphens (-) and slashes (/) are allowed under GST Rule 46(b)",
    };
  }
  return { valid: true };
}

