import { describe, expect, it } from "vitest";
import {
  computePurchaseLine,
  computeSaleLine,
  computeSaleTotals,
  pctToBp,
  roundToRupee,
  taxFromInclusive,
  taxOnExclusive,
  toPaise,
} from "@/lib/money";

describe("toPaise / pctToBp", () => {
  it("rounds to whole paise without float drift", () => {
    expect(toPaise(10.1)).toBe(1010);
    expect(toPaise("0.29")).toBe(29);
  });
  it("every 2-decimal rupee amount up to ₹10,000 converts to exactly its paise", () => {
    for (let paise = 0; paise <= 1_000_000; paise++) {
      if (toPaise(paise / 100) !== paise) throw new Error(`toPaise(${paise / 100}) !== ${paise}`);
    }
  });
  it("returns 0 for non-numbers", () => {
    expect(toPaise("abc")).toBe(0);
    expect(toPaise(NaN)).toBe(0);
  });
  it("converts percent to basis points", () => {
    expect(pctToBp(5)).toBe(500);
    expect(pctToBp(12.5)).toBe(1250);
  });
});

describe("taxFromInclusive (back-calculation from MRP)", () => {
  it("splits ₹105 inclusive at 5% into ₹100 + ₹5 tax, CGST = SGST", () => {
    expect(taxFromInclusive(10500, 500)).toEqual({ taxable: 10000, cgst: 250, sgst: 250, igst: 0, tax: 500 });
  });
  it("puts all tax in IGST when inter-state", () => {
    expect(taxFromInclusive(10500, 500, true)).toEqual({ taxable: 10000, cgst: 0, sgst: 0, igst: 500, tax: 500 });
  });
  it("0% rate has no tax", () => {
    expect(taxFromInclusive(12345, 0).tax).toBe(0);
  });
  it("cgst + sgst always equals tax exactly, even when the tax is an odd number of paise", () => {
    for (const rate of [0, 500, 1800, 4000]) {
      for (let amt = 1; amt <= 3000; amt += 7) {
        const t = taxFromInclusive(amt, rate);
        expect(t.cgst + t.sgst).toBe(t.tax);
        expect(t.taxable + t.tax).toBe(amt);
      }
    }
  });
});

describe("taxOnExclusive (purchase side)", () => {
  it("adds 5% on ₹100", () => {
    expect(taxOnExclusive(10000, 500)).toEqual({ taxable: 10000, cgst: 250, sgst: 250, igst: 0, tax: 500 });
  });
});

describe("computeSaleLine", () => {
  it("applies line discount before back-calculating tax", () => {
    // 2 x ₹105 = ₹210, 10% off = ₹21 -> ₹189 inclusive, 5% GST
    const r = computeSaleLine({ qty: 2, rate: 10500, discountBp: 1000, gstRateBp: 500 });
    expect(r.gross).toBe(21000);
    expect(r.discount).toBe(2100);
    expect(r.total).toBe(18900);
    expect(r.taxable).toBe(18000);
    expect(r.tax).toBe(900);
  });

  it("selling 3 loose tablets from a ₹100 10-tablet strip bills ₹30 and reports 3 base units", () => {
    const r = computeSaleLine({
      packQty: 0,
      looseQty: 3,
      unitsPerPack: 10,
      rate: 10000,
      discountBp: 0,
      gstRateBp: 500,
    });
    expect(r.gross).toBe(3000);
    expect(r.total).toBe(3000);
    expect(r.baseQty).toBe(3);
    expect(r.packQty).toBe(0);
    expect(r.looseQty).toBe(3);
  });

  it("selling 1 strip + 3 loose tablets computes ₹130 and 13 base units", () => {
    const r = computeSaleLine({
      packQty: 1,
      looseQty: 3,
      unitsPerPack: 10,
      rate: 10000,
      discountBp: 0,
      gstRateBp: 500,
    });
    expect(r.gross).toBe(13000);
    expect(r.total).toBe(13000);
    expect(r.baseQty).toBe(13);
  });

  it("normalizes looseQty >= unitsPerPack into packs", () => {
    const r = computeSaleLine({
      packQty: 0,
      looseQty: 15,
      unitsPerPack: 10,
      rate: 10000,
      discountBp: 0,
      gstRateBp: 500,
    });
    expect(r.packQty).toBe(1);
    expect(r.looseQty).toBe(5);
    expect(r.baseQty).toBe(15);
    expect(r.gross).toBe(15000);
  });

  it("applies discounts to the combined gross of packs and loose tablets", () => {
    const r = computeSaleLine({
      packQty: 1,
      looseQty: 3,
      unitsPerPack: 10,
      rate: 10000,
      discountBp: 1000,
      gstRateBp: 500,
    });
    expect(r.gross).toBe(13000);
    expect(r.discount).toBe(1300);
    expect(r.total).toBe(11700);
  });
});

describe("roundToRupee", () => {
  it.each([
    [1049, 1000, -49],
    [1050, 1100, 50],
    [1051, 1100, 49],
    [20000, 20000, 0],
  ])("rounds %i paise to %i (roundOff %i)", (amount, rounded, roundOff) => {
    expect(roundToRupee(amount)).toEqual({ rounded, roundOff });
  });
});

describe("computeSaleTotals", () => {
  const lines = [
    { qty: 3, rate: 3333, discountBp: 0, gstRateBp: 500 },
    { qty: 1, rate: 9999, discountBp: 500, gstRateBp: 1800 },
    { qty: 7, rate: 1234, discountBp: 0, gstRateBp: 0 },
  ];

  it("totals are rounded to the rupee and roundOff explains the difference", () => {
    const t = computeSaleTotals(lines);
    const net = t.lines.reduce((s, l) => s + l.total, 0);
    expect(t.total % 100).toBe(0);
    expect(t.total - net).toBe(t.roundOff);
  });

  it("a bill discount is spread across lines, never makes a line negative, and tax stays consistent", () => {
    const t = computeSaleTotals(lines, false, 5000);
    for (const l of t.lines) {
      expect(l.total).toBeGreaterThanOrEqual(0);
      expect(l.taxable + l.cgst + l.sgst + l.igst).toBe(l.total);
    }
    const before = computeSaleTotals(lines);
    // total discount increased by exactly the bill discount
    expect(t.discount - before.discount).toBe(5000);
  });

  it("a bill discount larger than the bill is capped at the bill", () => {
    const t = computeSaleTotals(lines, false, 99_999_999);
    expect(t.lines.every((l) => l.total === 0)).toBe(true);
    expect(t.total).toBe(0);
  });

  it("inter-state bills carry IGST only", () => {
    const t = computeSaleTotals(lines, true);
    expect(t.cgst).toBe(0);
    expect(t.sgst).toBe(0);
    expect(t.igst).toBeGreaterThan(0);
  });
});

describe("computePurchaseLine", () => {
  it("landed cost spreads taxable value over paid + free units (10+1 scheme)", () => {
    // 10 paid + 1 free at ₹100 excl. GST = ₹1000 taxable over 11 units
    const r = computePurchaseLine({ qty: 10, freeQty: 1, rate: 10000, discountBp: 0, gstRateBp: 500 });
    expect(r.taxable).toBe(100000);
    expect(r.tax).toBe(5000);
    expect(r.total).toBe(105000);
    expect(r.landedUnitCost).toBe(9091); // 100000 / 11 = 9090.9 -> 9091
  });
});
