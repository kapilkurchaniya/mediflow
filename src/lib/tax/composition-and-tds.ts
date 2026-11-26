/**
 * GST Composition Scheme (G5) & Income Tax TDS 194Q/194H/194C/194J (G9) calculators.
 */

export interface CompositionTaxSummary {
  grossTurnoverPaise: number;
  compositionRateBp: number; // 100 = 1% (0.5% CGST + 0.5% SGST for traders/pharmacies)
  cgstPaise: number;
  sgstPaise: number;
  totalTaxPaise: number;
  itcEligible: false;
}

export function computeCompositionTax(
  grossTurnoverPaise: number,
  rateBp = 100,
): CompositionTaxSummary {
  const turnover = Math.max(0, Math.round(grossTurnoverPaise));
  const totalTaxPaise = Math.round((turnover * rateBp) / 10000);
  const cgstPaise = Math.floor(totalTaxPaise / 2);
  const sgstPaise = totalTaxPaise - cgstPaise;
  return {
    grossTurnoverPaise: turnover,
    compositionRateBp: rateBp,
    cgstPaise,
    sgstPaise,
    totalTaxPaise,
    itcEligible: false,
  };
}

export type TdsSection = "194Q" | "194H" | "194C_IND" | "194C_OTH" | "194J";

export const TDS_SECTION_RATES_BP: Record<TdsSection, { label: string; rateBp: number; panMissingRateBp: number }> = {
  "194Q": { label: "194Q Purchase of Goods (>₹50L)", rateBp: 10, panMissingRateBp: 500 },
  "194H": { label: "194H Commission / Brokerage", rateBp: 200, panMissingRateBp: 2000 },
  "194C_IND": { label: "194C Contractor (Individual/HUF)", rateBp: 100, panMissingRateBp: 2000 },
  "194C_OTH": { label: "194C Contractor (Company/Firm)", rateBp: 200, panMissingRateBp: 2000 },
  "194J": { label: "194J Professional / Technical Fees", rateBp: 1000, panMissingRateBp: 2000 },
};

export interface TdsCalculationResult {
  section: TdsSection;
  baseAmountPaise: number;
  rateBp: number;
  tdsAmountPaise: number;
  netPayablePaise: number;
}

export function computeTdsDeduction(input: {
  section: TdsSection;
  baseAmountPaise: number;
  hasPan?: boolean;
}): TdsCalculationResult {
  const cfg = TDS_SECTION_RATES_BP[input.section];
  const rateBp = input.hasPan === false ? cfg.panMissingRateBp : cfg.rateBp;
  const base = Math.max(0, Math.round(input.baseAmountPaise));
  const tdsAmountPaise = Math.round((base * rateBp) / 10000);
  return {
    section: input.section,
    baseAmountPaise: base,
    rateBp,
    tdsAmountPaise,
    netPayablePaise: Math.max(0, base - tdsAmountPaise),
  };
}
