import { describe, expect, it } from "vitest";
import { computeSaleLine, computeSaleTotals } from "@/lib/money";
import { formatItemQuantity, formatItemQuantityCompact } from "@/lib/format";

describe("Pharmacy Unit Conversion Engine (A2.10 Unit Tests)", () => {
  describe("computeSaleLine: quantity normalization & derivation", () => {
    it("normalizes loose tablets exceeding unitsPerPack into packs", () => {
      // 12 loose tablets for a 10-tablet strip
      const res = computeSaleLine({
        packQty: 0,
        looseQty: 12,
        unitsPerPack: 10,
        rate: 10000, // ₹100.00
        discountBp: 0,
        gstRateBp: 500,
      });

      expect(res.packQty).toBe(1);
      expect(res.looseQty).toBe(2);
      expect(res.baseQty).toBe(12);
      // 1 strip (₹100) + 2 loose (₹20) = ₹120.00
      expect(res.total).toBe(12000);
    });

    it("handles loose-only tablet sales (packQty = 0)", () => {
      // 3 loose tablets from a 10-tablet strip @ ₹100
      const res = computeSaleLine({
        packQty: 0,
        looseQty: 3,
        unitsPerPack: 10,
        rate: 10000,
        discountBp: 0,
        gstRateBp: 500,
      });

      expect(res.packQty).toBe(0);
      expect(res.looseQty).toBe(3);
      expect(res.baseQty).toBe(3);
      expect(res.total).toBe(3000); // exactly ₹30.00
    });

    it("handles mixed pack and loose tablet sales", () => {
      // 2 strips and 5 loose tablets from a 10-tablet strip @ ₹150
      const res = computeSaleLine({
        packQty: 2,
        looseQty: 5,
        unitsPerPack: 10,
        rate: 15000,
        discountBp: 0,
        gstRateBp: 500,
      });

      expect(res.packQty).toBe(2);
      expect(res.looseQty).toBe(5);
      expect(res.baseQty).toBe(25);
      // 2 * 150 + 5 * 15 = 300 + 75 = ₹375.00
      expect(res.total).toBe(37500);
    });

    it("handles medicines with no strip-cutting (unitsPerPack = 1)", () => {
      const res = computeSaleLine({
        packQty: 3,
        looseQty: 0,
        unitsPerPack: 1,
        rate: 5000, // ₹50.00 bottle
        discountBp: 0,
        gstRateBp: 1200,
      });

      expect(res.packQty).toBe(3);
      expect(res.looseQty).toBe(0);
      expect(res.baseQty).toBe(3);
      expect(res.total).toBe(15000);
    });

    it("preserves aggregate rounding consistency on uneven pack rates without floating-point error", () => {
      // ₹99.99 strip with 7 tablets per pack
      // 3 loose tablets: Math.round(3 * 9999 / 7) = Math.round(29997 / 7) = Math.round(4285.285) = 4285 paise (₹42.85)
      const res = computeSaleLine({
        packQty: 0,
        looseQty: 3,
        unitsPerPack: 7,
        rate: 9999,
        discountBp: 0,
        gstRateBp: 500,
      });

      expect(res.total).toBe(4285);
      expect(res.baseQty).toBe(3);
    });

    it("correctly extracts tax components from loose tablet prices", () => {
      // 3 tablets from ₹100 strip @ 5% GST (intra-state)
      const res = computeSaleLine({
        packQty: 0,
        looseQty: 3,
        unitsPerPack: 10,
        rate: 10000,
        discountBp: 0,
        gstRateBp: 500,
      });

      expect(res.total).toBe(3000);
      // taxable = Math.round(3000 * 10000 / 10500) = Math.round(2857.14) = 2857 paise
      expect(res.taxable).toBe(2857);
      // tax = 3000 - 2857 = 143 paise (cgst = 71, sgst = 72)
      expect(res.cgst).toBe(71);
      expect(res.sgst).toBe(72);
      expect(res.taxable + res.cgst + res.sgst).toBe(3000);
    });
  });

  describe("formatItemQuantity & formatItemQuantityCompact: invoice presentation", () => {
    it("formats loose-only sales clearly with loose unit label", () => {
      expect(
        formatItemQuantity({
          qty: 3,
          packQty: 0,
          looseQty: 3,
          unitsPerPack: 10,
          packUnit: "strip",
          looseUnit: "tablet",
        }),
      ).toBe("3 tablets");

      expect(
        formatItemQuantityCompact({
          qty: 3,
          packQty: 0,
          looseQty: 3,
          unitsPerPack: 10,
          packUnit: "strip",
          looseUnit: "tablet",
        }),
      ).toBe("3 tab");
    });

    it("formats whole pack sales with pack unit label", () => {
      expect(
        formatItemQuantity({
          qty: 20,
          packQty: 2,
          looseQty: 0,
          unitsPerPack: 10,
          packUnit: "strip",
          looseUnit: "tablet",
        }),
      ).toBe("2 strips");

      expect(
        formatItemQuantityCompact({
          qty: 20,
          packQty: 2,
          looseQty: 0,
          unitsPerPack: 10,
          packUnit: "strip",
          looseUnit: "tablet",
        }),
      ).toBe("2 str");
    });

    it("formats mixed pack + loose sales clearly", () => {
      expect(
        formatItemQuantity({
          qty: 14,
          packQty: 1,
          looseQty: 4,
          unitsPerPack: 10,
          packUnit: "strip",
          looseUnit: "tablet",
        }),
      ).toBe("1 strip + 4 tablets");

      expect(
        formatItemQuantityCompact({
          qty: 14,
          packQty: 1,
          looseQty: 4,
          unitsPerPack: 10,
          packUnit: "strip",
          looseUnit: "tablet",
        }),
      ).toBe("1 str + 4 tab");
    });

    it("formats single unit sales without plural suffix", () => {
      expect(
        formatItemQuantity({
          qty: 1,
          packQty: 0,
          looseQty: 1,
          unitsPerPack: 10,
          packUnit: "strip",
          looseUnit: "tablet",
        }),
      ).toBe("1 tablet");

      expect(
        formatItemQuantity({
          qty: 10,
          packQty: 1,
          looseQty: 0,
          unitsPerPack: 10,
          packUnit: "strip",
          looseUnit: "tablet",
        }),
      ).toBe("1 strip");
    });
  });
});
