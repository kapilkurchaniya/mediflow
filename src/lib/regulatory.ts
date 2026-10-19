/**
 * src/lib/regulatory.ts
 *
 * Single source of truth for all Indian pharmacy regulatory constants.
 * Import from here instead of scattering magic numbers across the codebase.
 *
 * Sources:
 *  - GST rates: CBIC Notification 01/2017-CT(Rate) as amended (Pharmaceutical HSN 3003/3004)
 *  - CGST Act 2017 (B2CL threshold, e-invoice thresholds, e-way bill threshold)
 *  - Drugs & Cosmetics Act 1940 (schedule definitions)
 *  - DPDP Act 2023 (data protection)
 *
 * Keep amounts in PAISE (₹1 = 100 paise) and rates in BASIS POINTS (1% = 100 bp).
 */

// ─── GST Rates (in basis points) ─────────────────────────────────────────────

/**
 * Valid GST rates for pharmaceutical products under HSN 3003 / 3004.
 * Updated to GST 2.0 notification (most medicines moved from 12% → 5%).
 */
export const GST_RATES_BP = [0, 500, 1200, 1800, 2800] as const;
export type GstRateBp = (typeof GST_RATES_BP)[number];

/** Default GST rate for new medicines (5% per GST 2.0). */
export const DEFAULT_GST_RATE_BP: GstRateBp = 500;

/** Validates that a given basis-point value is a legal GST rate. */
export function isValidGstRateBp(bp: number): bp is GstRateBp {
  return (GST_RATES_BP as readonly number[]).includes(bp);
}

/** Converts basis points to a human-readable percentage string. E.g. 500 → "5%" */
export function formatGstRate(bp: number): string {
  return `${bp / 100}%`;
}

// ─── GST Thresholds (amounts in PAISE) ───────────────────────────────────────

/**
 * B2CL threshold: B2C sales ABOVE this amount must appear in GSTR-1 Table 5 (B2CL).
 * ₹2,50,000 = 25,000,000 paise.
 */
export const B2CL_THRESHOLD_PAISE = 25_000_000;

/**
 * E-invoice mandatory threshold: annual aggregate turnover above this requires
 * e-invoicing for all B2B supplies.
 * ₹5 Crore = 500,000,000 paise.
 */
export const EINVOICE_MANDATORY_TURNOVER_PAISE = 500_000_000;

/**
 * E-way bill threshold: inter-state or intra-state consignments above this
 * value require an e-way bill.
 * ₹50,000 = 5,000,000 paise.
 */
export const EWAY_BILL_THRESHOLD_PAISE = 5_000_000;

// ─── Invoice Number Limits ────────────────────────────────────────────────────

/** Maximum length of a GST-compliant invoice number (Rule 46, CGST Rules). */
export const MAX_INVOICE_NO_LENGTH = 16;

// ─── Drug Schedules ───────────────────────────────────────────────────────────

/**
 * Drugs & Cosmetics Act — schedule codes used in the dispensing register.
 */
export const DRUG_SCHEDULES = ["H", "H1", "X", "G", "C", "C1", "E1"] as const;
export type DrugSchedule = (typeof DRUG_SCHEDULES)[number];

/** Schedules that require a valid prescription before dispensing. */
export const PRESCRIPTION_REQUIRED_SCHEDULES: DrugSchedule[] = ["H", "H1", "X"];

/** Schedules that require the pharmacist's name on the dispensing log. */
export const PHARMACIST_SIGN_REQUIRED_SCHEDULES: DrugSchedule[] = ["H1", "X"];

// ─── Loyalty ─────────────────────────────────────────────────────────────────

/** Default earn rate: 1 point per ₹10 spent. Points are whole integers. */
export const DEFAULT_LOYALTY_EARN_RATE = 10; // paise per point

// ─── DPDP / Data Retention ───────────────────────────────────────────────────

/**
 * Minimum statutory record retention period for pharmacy purchase/dispensing
 * registers under Drugs & Cosmetics Act Rule 65 (varies by state; 2 years is
 * the floor for most schedules, 5 years for narcotics/X).
 */
export const MIN_REGISTER_RETENTION_YEARS = 2;
export const NARCOTIC_REGISTER_RETENTION_YEARS = 5;
