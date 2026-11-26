/**
 * GSTR-9 Annual Return Data Preparation Summary (B9.6 / G6).
 */
export interface Gstr9MonthlyRow {
  month: string; // YYYY-MM
  b2bTaxablePaise: number;
  b2cTaxablePaise: number;
  creditNoteTaxablePaise: number;
  outputTaxPaise: number;
  itcClaimedPaise: number;
  itcReversedPaise: number;
}

export interface Gstr9AnnualSummary {
  financialYear: string;
  outwardTaxablePaise: number;
  outwardTaxPaise: number;
  netItcPaise: number;
  itcReversedPaise: number;
  netTaxPayableOrCreditPaise: number;
  monthsCovered: number;
}

export function buildGstr9AnnualSummary(
  financialYear: string,
  rows: Gstr9MonthlyRow[],
): Gstr9AnnualSummary {
  let outwardTaxablePaise = 0;
  let outwardTaxPaise = 0;
  let itcClaimedPaise = 0;
  let itcReversedPaise = 0;

  for (const r of rows) {
    outwardTaxablePaise += r.b2bTaxablePaise + r.b2cTaxablePaise - r.creditNoteTaxablePaise;
    outwardTaxPaise += r.outputTaxPaise;
    itcClaimedPaise += r.itcClaimedPaise;
    itcReversedPaise += r.itcReversedPaise;
  }

  const netItcPaise = Math.max(0, itcClaimedPaise - itcReversedPaise);
  const netTaxPayableOrCreditPaise = outwardTaxPaise - netItcPaise;

  return {
    financialYear,
    outwardTaxablePaise,
    outwardTaxPaise,
    netItcPaise,
    itcReversedPaise,
    netTaxPayableOrCreditPaise,
    monthsCovered: rows.length,
  };
}
