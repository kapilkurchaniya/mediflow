import { isValidGstin, extractStateCodeFromGstin } from "@/server/domain/gst";
import { GST_RATES_BP, DEFAULT_GST_RATE_BP } from "@/lib/regulatory";

/**
 * Normalizes pharma expiry dates into standard ISO YYYY-MM-DD.
 * Supports:
 * - "MM/YY" or "MM-YY" (e.g. "11/26" -> "2026-11-30")
 * - "MM/YYYY" or "MM-YYYY" (e.g. "08/2027" -> "2027-08-31")
 * - "DD/MM/YYYY" or "DD-MM-YYYY" (e.g. "15/08/2027" -> "2027-08-15")
 * - "YYYY-MM-DD"
 */
export function normalizeExpiryDate(raw: string | null | undefined): {
  success: boolean;
  date?: string;
  error?: string;
} {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { success: false, error: "Expiry date is missing" };
  }

  const s = raw.trim();

  // 1. ISO YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { success: false, error: `Invalid date: ${s}` };
    }
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
      return { success: false, error: `Invalid calendar date: ${s}` };
    }
    return {
      success: true,
      date: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`,
    };
  }

  // 2. Full DD/MM/YYYY or DD-MM-YYYY
  const fullMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (fullMatch) {
    const day = parseInt(fullMatch[1], 10);
    const month = parseInt(fullMatch[2], 10);
    const year = parseInt(fullMatch[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { success: false, error: `Invalid date: ${s}` };
    }
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
      return { success: false, error: `Invalid calendar date: ${s}` };
    }
    return {
      success: true,
      date: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`,
    };
  }

  // 3. Month & Year format: MM/YY or MM-YY or MM/YYYY or MM-YYYY
  const myMatch = s.match(/^(\d{1,2})[-/](\d{2}|\d{4})$/);
  if (myMatch) {
    const month = parseInt(myMatch[1], 10);
    let year = parseInt(myMatch[2], 10);
    if (year < 100) {
      year += 2000;
    }
    if (month < 1 || month > 12) {
      return { success: false, error: `Invalid month: ${myMatch[1]}` };
    }
    // Calculate last day of this month
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      success: true,
      date: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${lastDay.toString().padStart(2, "0")}`,
    };
  }

  return { success: false, error: `Unrecognized expiry format: ${s}` };
}

/**
 * Normalizes Indian currency strings into integer paise.
 * E.g. "₹1,234.50", "1234.5", "1,234", "Rs. 25.40", 34.00 -> 3400
 */
export function normalizePaise(raw: unknown): {
  success: boolean;
  paise?: number;
  error?: string;
} {
  if (raw === null || raw === undefined || raw === "") {
    return { success: true, paise: 0 };
  }

  if (typeof raw === "number") {
    if (isNaN(raw) || !isFinite(raw) || raw < 0) {
      return { success: false, error: `Invalid numeric amount: ${raw}` };
    }
    return { success: true, paise: Math.round(raw * 100) };
  }

  if (typeof raw === "string") {
    // Strip currency symbols (₹, Rs, Rs.), commas, whitespace
    const cleaned = raw.replace(/[₹\s,]|Rs\.?/gi, "");
    if (!cleaned) return { success: true, paise: 0 };
    const num = Number(cleaned);
    if (isNaN(num) || !isFinite(num) || num < 0) {
      return { success: false, error: `Invalid monetary value: ${raw}` };
    }
    return { success: true, paise: Math.round(num * 100) };
  }

  return { success: false, error: `Unsupported money value: ${raw}` };
}

/**
 * Normalizes GST percentage to basis points (e.g. 12% -> 1200 bp).
 * Flags legacy 12% rates for potential GST 2.0 re-rate offer (to 500 bp / 5%).
 */
export function normalizeGstRate(raw: unknown): {
  success: boolean;
  gstRateBp?: number;
  isLegacy12Percent?: boolean;
  error?: string;
} {
  if (raw === null || raw === undefined || raw === "") {
    return { success: true, gstRateBp: DEFAULT_GST_RATE_BP, isLegacy12Percent: false };
  }

  let num: number;
  if (typeof raw === "number") {
    num = raw;
  } else if (typeof raw === "string") {
    const cleaned = raw.replace(/[%,\s]/g, "");
    num = Number(cleaned);
  } else {
    return { success: false, error: `Invalid GST rate: ${raw}` };
  }

  if (isNaN(num) || num < 0) {
    return { success: false, error: `Invalid GST rate value: ${raw}` };
  }

  // If already given in basis points (> 100, e.g. 500, 1200, 1800)
  const bp = num > 100 ? Math.round(num) : Math.round(num * 100);

  const isLegacy = bp === 1200;
  return {
    success: true,
    gstRateBp: bp,
    isLegacy12Percent: isLegacy,
  };
}

/**
 * Normalizes Indian phone / mobile numbers to clean 10 digits.
 * Strips "+91", "91", leading "0", hyphens, spaces.
 */
export function normalizePhone(raw: string | null | undefined): {
  success: boolean;
  phone?: string;
  error?: string;
} {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { success: true, phone: undefined };
  }

  const digits = raw.replace(/\D/g, "");
  let tenDigits = digits;

  if (digits.length === 12 && digits.startsWith("91")) {
    tenDigits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    tenDigits = digits.slice(1);
  }

  if (tenDigits.length !== 10) {
    return { success: false, error: `Phone must be 10 digits (got ${raw})` };
  }

  if (!/^[6-9]\d{9}$/.test(tenDigits)) {
    return { success: false, error: `Invalid Indian mobile number: ${raw}` };
  }

  return { success: true, phone: tenDigits };
}

/**
 * Normalizes and validates Indian GSTIN.
 */
export function normalizeGstin(raw: string | null | undefined): {
  success: boolean;
  gstin?: string;
  stateCode?: string;
  error?: string;
} {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { success: true, gstin: undefined, stateCode: undefined };
  }

  const clean = raw.trim().toUpperCase();
  if (clean.length !== 15) {
    return { success: false, error: `GSTIN must be exactly 15 characters (got ${clean})` };
  }

  if (!isValidGstin(clean)) {
    return { success: false, error: `Invalid GSTIN checksum or pattern: ${clean}` };
  }

  const stateCode = extractStateCodeFromGstin(clean) ?? clean.slice(0, 2);
  return { success: true, gstin: clean, stateCode };
}

/**
 * Normalizes drug schedule descriptions.
 */
export function normalizeSchedule(
  raw: string | null | undefined
): "regular" | "g" | "h" | "h1" | "x" {
  if (!raw || typeof raw !== "string") return "regular";

  const s = raw.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (s === "h1" || s === "schh1" || s === "scheduleh1") return "h1";
  if (s === "h" || s === "schh" || s === "scheduleh") return "h";
  if (s === "x" || s === "schx" || s === "schedulex" || s === "narcotic" || s === "ndps") return "x";
  if (s === "g" || s === "schg" || s === "scheduleg") return "g";
  return "regular";
}

/**
 * Normalizes packaging text into units per pack count.
 * E.g. "15 TAB", "15'S", "10 CAP", "1x10", "10", "200 ML"
 */
export function normalizeUnitsPerPack(packing: string | null | undefined): number {
  if (!packing || typeof packing !== "string") return 1;

  const s = packing.trim().toUpperCase();

  // If liquid, syrup, weight, or single container (e.g. "200 ML", "100 GM", "BOTTLE", "VIAL")
  if (/\b(?:ML|LTR?|GM|GMS|KG|KGS|BOTTLE|SYRUP|SUSPENSION|VIAL|AMPOULE|DROPS|OINTMENT|GEL|CREAM)\b/.test(s)) {
    return 1;
  }

  // Pattern: "10 x 10" or "1x10" -> multiply
  const multMatch = s.match(/^(\d+)\s*[xX*]\s*(\d+)/);
  if (multMatch) {
    const a = parseInt(multMatch[1], 10);
    const b = parseInt(multMatch[2], 10);
    if (a > 0 && b > 0) return a * b;
  }

  // Pattern: "15'S" or "15 TAB" or "10 CAP" or "15S"
  const leadMatch = s.match(/^(\d+)\s*(?:'S|S|TAB|CAP|TABLET|CAPSULE)?\b/);
  if (leadMatch) {
    const count = parseInt(leadMatch[1], 10);
    if (count > 0) return count;
  }

  return 1;
}
