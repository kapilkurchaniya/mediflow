/**
 * Money & GST arithmetic. Pure functions — safe for both server and client.
 *
 * All amounts are integer paise. Rates are basis points (1200 = 12%).
 * Retail sale prices in Indian pharmacies are GST-inclusive (MRP-based), while purchase
 * rates on supplier invoices are GST-exclusive. Both are modelled explicitly below.
 */

export const toPaise = (rupees: number | string): number => {
  const n = typeof rupees === "string" ? Number(rupees) : rupees;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
};

export const fromPaise = (paise: number): number => paise / 100;

const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const inrFmt0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export const formatINR = (paise: number, opts?: { whole?: boolean }) =>
  (opts?.whole ? inrFmt0 : inrFmt).format((paise ?? 0) / 100);

/** Compact INR: ₹1.2L, ₹3.4Cr */
export function formatINRCompact(paise: number): string {
  const r = (paise ?? 0) / 100;
  const abs = Math.abs(r);
  if (abs >= 1e7) return `₹${(r / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(r / 1e5).toFixed(2)}L`;
  if (abs >= 1e3) return `₹${(r / 1e3).toFixed(1)}K`;
  return `₹${r.toFixed(0)}`;
}

export const bpToPct = (bp: number) => bp / 100;
export const pctToBp = (pct: number) => Math.round(pct * 100);

export interface TaxSplit {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
}

function splitTax(taxable: number, tax: number, interState: boolean): TaxSplit {
  if (interState) return { taxable, cgst: 0, sgst: 0, igst: tax, tax };
  const cgst = Math.floor(tax / 2);
  const sgst = tax - cgst; // odd paisa goes to SGST so cgst+sgst === tax exactly
  return { taxable, cgst, sgst, igst: 0, tax };
}

/** Back-calculate tax from a GST-inclusive amount. */
export function taxFromInclusive(inclusive: number, gstRateBp: number, interState = false): TaxSplit {
  const taxable = Math.round((inclusive * 10000) / (10000 + gstRateBp));
  return splitTax(taxable, inclusive - taxable, interState);
}

/** Compute tax on a GST-exclusive (taxable) amount. */
export function taxOnExclusive(taxable: number, gstRateBp: number, interState = false): TaxSplit {
  const tax = Math.round((taxable * gstRateBp) / 10000);
  return splitTax(taxable, tax, interState);
}

export interface SaleLineInput {
  qty?: number;
  packQty?: number;
  looseQty?: number;
  unitsPerPack?: number;
  rate: number; // GST-inclusive per whole pack in paise
  discountBp: number;
  gstRateBp: number;
}

export interface SaleLineResult extends TaxSplit {
  gross: number;
  discount: number;
  total: number; // GST-inclusive after discount
  baseQty: number;
  packQty: number;
  looseQty: number;
}

export function computeSaleLine(line: SaleLineInput, interState = false): SaleLineResult {
  const upp = Math.max(1, line.unitsPerPack ?? 1);
  let pQty = line.packQty ?? 0;
  let lQty = line.looseQty ?? 0;
  let baseQty = 0;
  let gross = 0;

  if (line.packQty !== undefined || line.looseQty !== undefined) {
    if (lQty >= upp) {
      pQty += Math.floor(lQty / upp);
      lQty = lQty % upp;
    }
    baseQty = (pQty * upp) + lQty;
    const looseAmount = upp > 1 ? Math.round((lQty * line.rate) / upp) : 0;
    gross = (pQty * line.rate) + (upp === 1 ? lQty * line.rate : looseAmount);
  } else {
    baseQty = line.qty ?? 0;
    pQty = Math.floor(baseQty / upp);
    lQty = baseQty % upp;
    if (upp > 1) {
      gross = (pQty * line.rate) + Math.round((lQty * line.rate) / upp);
    } else {
      gross = baseQty * line.rate;
    }
  }

  const discount = Math.round((gross * line.discountBp) / 10000);
  const total = gross - discount;
  return {
    gross,
    discount,
    total,
    baseQty,
    packQty: pQty,
    looseQty: lQty,
    ...taxFromInclusive(total, line.gstRateBp, interState),
  };
}

export interface DocTotals {
  gross: number;
  discount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax?: number;
  roundOff: number;
  total: number;
}

/** Round the payable to the nearest rupee, like printed pharmacy bills. */
export function roundToRupee(amount: number): { rounded: number; roundOff: number } {
  const rounded = Math.round(amount / 100) * 100;
  return { rounded, roundOff: rounded - amount };
}

export function computeSaleTotals(lines: SaleLineInput[], interState = false, billDiscount = 0): DocTotals & { lines: SaleLineResult[] } {
  const results = lines.map((l) => computeSaleLine(l, interState));
  const gross = results.reduce((s, r) => s + r.gross, 0);
  const lineDiscount = results.reduce((s, r) => s + r.discount, 0);
  const afterLine = gross - lineDiscount;
  // Bill-level discount is distributed proportionally across lines so tax remains correct.
  if (billDiscount > 0 && afterLine > 0) {
    let remaining = Math.min(billDiscount, afterLine);
    results.forEach((r, i) => {
      const share = i === results.length - 1 ? remaining : Math.round((billDiscount * r.total) / afterLine);
      const applied = Math.min(share, remaining, r.total);
      remaining -= applied;
      const newTotal = r.total - applied;
      Object.assign(r, { discount: r.discount + applied, total: newTotal, ...taxFromInclusive(newTotal, lines[i].gstRateBp, interState) });
    });
  }
  const sum = (k: keyof SaleLineResult) => results.reduce((s, r) => s + (r[k] as number), 0);
  const net = sum("total");
  const { rounded, roundOff } = roundToRupee(net);
  return {
    lines: results,
    gross,
    discount: sum("discount"),
    taxable: sum("taxable"),
    cgst: sum("cgst"),
    sgst: sum("sgst"),
    igst: sum("igst"),
    tax: sum("tax"),
    roundOff,
    total: rounded,
  };
}

export interface PurchaseLineInput {
  qty: number;
  freeQty: number;
  rate: number; // GST-exclusive per purchase pack
  discountBp?: number; // legacy alias for tradeDiscountBp
  tradeDiscountBp?: number;
  cashDiscountBp?: number;
  unitsPerPack?: number;
  gstRateBp: number;
}

export interface PurchaseLineResult extends TaxSplit {
  gross: number;
  discount: number; // trade discount in paise
  tradeDiscount: number; // trade discount in paise
  cashDiscount: number; // cash discount in paise
  total: number;
  totalPacks: number;
  totalBaseUnits: number;
  unitsPerPack: number;
  landedPackCost: number; // (taxable - cashDiscount) / totalPacks
  landedUnitCost: number; // (taxable - cashDiscount) / totalBaseUnits
}

export function computePurchaseLine(line: PurchaseLineInput, interState = false): PurchaseLineResult {
  const tradeDiscountBp = line.tradeDiscountBp ?? line.discountBp ?? 0;
  const cashDiscountBp = line.cashDiscountBp ?? 0;
  const upp = Math.max(1, line.unitsPerPack ?? 1);

  const gross = line.qty * line.rate;
  const tradeDiscount = Math.round((gross * tradeDiscountBp) / 10000);
  const taxable = gross - tradeDiscount;
  const t = taxOnExclusive(taxable, line.gstRateBp, interState);

  const cashDiscount = Math.round((taxable * cashDiscountBp) / 10000);
  const total = taxable + t.tax - cashDiscount;

  const totalPacks = line.qty + line.freeQty;
  const totalBaseUnits = totalPacks * upp;

  const landedPackCost = totalPacks > 0 ? Math.round((taxable - cashDiscount) / totalPacks) : 0;
  const landedUnitCost = totalBaseUnits > 0 ? Math.round((taxable - cashDiscount) / totalBaseUnits) : 0;

  return {
    gross,
    discount: tradeDiscount,
    tradeDiscount,
    cashDiscount,
    ...t,
    total,
    totalPacks,
    totalBaseUnits,
    unitsPerPack: upp,
    landedPackCost,
    landedUnitCost,
  };
}

export function computePurchaseTotals(lines: PurchaseLineInput[], interState = false) {
  const results = lines.map((l) => computePurchaseLine(l, interState));
  const sum = (k: keyof PurchaseLineResult) => results.reduce((s, r) => s + (r[k] as number), 0);
  const net = sum("total");
  const { rounded, roundOff } = roundToRupee(net);
  return {
    lines: results,
    gross: sum("gross"),
    discount: sum("discount"),
    tradeDiscount: sum("tradeDiscount"),
    cashDiscount: sum("cashDiscount"),
    taxable: sum("taxable"),
    cgst: sum("cgst"),
    sgst: sum("sgst"),
    igst: sum("igst"),
    tax: sum("tax"),
    roundOff,
    total: rounded,
  };
}
