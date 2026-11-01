import { describe, it, expect } from "vitest";
import {
  normalizeExpiryDate,
  normalizePaise,
  normalizeGstRate,
  normalizePhone,
  normalizeGstin,
  normalizeSchedule,
  normalizeUnitsPerPack,
} from "@/server/domain/import/normalize";

describe("Import Field Normalizers (Task B4.2)", () => {
  describe("normalizeExpiryDate", () => {
    it("normalizes MM/YY format to the last day of the month", () => {
      const res = normalizeExpiryDate("11/26");
      expect(res.success).toBe(true);
      expect(res.date).toBe("2026-11-30");

      const feb24 = normalizeExpiryDate("02/24"); // Leap year 2024
      expect(feb24.success).toBe(true);
      expect(feb24.date).toBe("2024-02-29");

      const feb25 = normalizeExpiryDate("02/25"); // Non-leap year 2025
      expect(feb25.success).toBe(true);
      expect(feb25.date).toBe("2025-02-28");
    });

    it("normalizes MM/YYYY format to the last day of the month", () => {
      const res = normalizeExpiryDate("08/2027");
      expect(res.success).toBe(true);
      expect(res.date).toBe("2027-08-31");

      const april = normalizeExpiryDate("4/2028");
      expect(april.success).toBe(true);
      expect(april.date).toBe("2028-04-30");
    });

    it("normalizes full DD/MM/YYYY and DD-MM-YYYY dates", () => {
      const res1 = normalizeExpiryDate("15/08/2027");
      expect(res1.success).toBe(true);
      expect(res1.date).toBe("2027-08-15");

      const res2 = normalizeExpiryDate("05-12-2026");
      expect(res2.success).toBe(true);
      expect(res2.date).toBe("2026-12-05");
    });

    it("validates standard ISO YYYY-MM-DD", () => {
      const res = normalizeExpiryDate("2027-10-31");
      expect(res.success).toBe(true);
      expect(res.date).toBe("2027-10-31");
    });

    it("rejects invalid calendar dates and formats", () => {
      expect(normalizeExpiryDate("").success).toBe(false);
      expect(normalizeExpiryDate("invalid").success).toBe(false);
      expect(normalizeExpiryDate("13/2027").success).toBe(false); // Month 13
      expect(normalizeExpiryDate("31/02/2027").success).toBe(false); // Feb 31
    });
  });

  describe("normalizePaise", () => {
    it("converts rupees to paise integers", () => {
      expect(normalizePaise(34.00)).toEqual({ success: true, paise: 3400 });
      expect(normalizePaise(165.20)).toEqual({ success: true, paise: 16520 });
      expect(normalizePaise("₹1,234.50")).toEqual({ success: true, paise: 123450 });
      expect(normalizePaise("Rs. 25.40")).toEqual({ success: true, paise: 2540 });
      expect(normalizePaise("1,234")).toEqual({ success: true, paise: 123400 });
      expect(normalizePaise("0")).toEqual({ success: true, paise: 0 });
      expect(normalizePaise("")).toEqual({ success: true, paise: 0 });
      expect(normalizePaise(null)).toEqual({ success: true, paise: 0 });
    });

    it("rejects negative or malformed values", () => {
      expect(normalizePaise(-50).success).toBe(false);
      expect(normalizePaise("-100.50").success).toBe(false);
      expect(normalizePaise("abc").success).toBe(false);
    });
  });

  describe("normalizeGstRate", () => {
    it("converts percentage strings to basis points", () => {
      expect(normalizeGstRate("5%")).toEqual({ success: true, gstRateBp: 500, isLegacy12Percent: false });
      expect(normalizeGstRate("18.00")).toEqual({ success: true, gstRateBp: 1800, isLegacy12Percent: false });
      expect(normalizeGstRate(5)).toEqual({ success: true, gstRateBp: 500, isLegacy12Percent: false });
    });

    it("flags legacy 12% rates for GST 2.0 re-rate offer", () => {
      const res = normalizeGstRate("12.00");
      expect(res.success).toBe(true);
      expect(res.gstRateBp).toBe(1200);
      expect(res.isLegacy12Percent).toBe(true);
    });

    it("defaults empty GST rate to 500 bp (5%)", () => {
      expect(normalizeGstRate("")).toEqual({ success: true, gstRateBp: 500, isLegacy12Percent: false });
      expect(normalizeGstRate(null)).toEqual({ success: true, gstRateBp: 500, isLegacy12Percent: false });
    });
  });

  describe("normalizePhone", () => {
    it("cleans and verifies Indian mobile numbers", () => {
      expect(normalizePhone("9811002233")).toEqual({ success: true, phone: "9811002233" });
      expect(normalizePhone("+91 9811002233")).toEqual({ success: true, phone: "9811002233" });
      expect(normalizePhone("09811002233")).toEqual({ success: true, phone: "9811002233" });
      expect(normalizePhone("98110-02233")).toEqual({ success: true, phone: "9811002233" });
    });

    it("allows empty optional phones", () => {
      expect(normalizePhone("")).toEqual({ success: true, phone: undefined });
      expect(normalizePhone(null)).toEqual({ success: true, phone: undefined });
    });

    it("rejects invalid phone numbers", () => {
      expect(normalizePhone("12345").success).toBe(false); // Too short
      expect(normalizePhone("0112345678").success).toBe(false); // Landline starting with 011
      expect(normalizePhone("5123456789").success).toBe(false); // Doesn't start with 6-9
    });
  });

  describe("normalizeGstin", () => {
    it("validates and formats GSTIN with state code extraction", () => {
      const maharashtraGstin = "27GSPTE0985F1Z5";
      const res = normalizeGstin(maharashtraGstin);
      expect(res.success).toBe(true);
      expect(res.gstin).toBe("27GSPTE0985F1Z5");
      expect(res.stateCode).toBe("27");
    });

    it("handles lowercase and whitespace", () => {
      const res = normalizeGstin(" 27gspte0985f1z5 ");
      expect(res.success).toBe(true);
      expect(res.gstin).toBe("27GSPTE0985F1Z5");
    });

    it("rejects invalid GSTIN strings", () => {
      expect(normalizeGstin("INVALID").success).toBe(false);
      expect(normalizeGstin("27GSPTE0985F1Z").success).toBe(false); // Too short
    });
  });

  describe("normalizeSchedule", () => {
    it("maps text to schedule enums", () => {
      expect(normalizeSchedule("H1")).toBe("h1");
      expect(normalizeSchedule("Sch H1")).toBe("h1");
      expect(normalizeSchedule("SCHEDULE H1")).toBe("h1");
      expect(normalizeSchedule("H")).toBe("h");
      expect(normalizeSchedule("Schedule H")).toBe("h");
      expect(normalizeSchedule("X")).toBe("x");
      expect(normalizeSchedule("Narcotic")).toBe("x");
      expect(normalizeSchedule("NDPS")).toBe("x");
      expect(normalizeSchedule("G")).toBe("g");
      expect(normalizeSchedule("General")).toBe("regular");
      expect(normalizeSchedule("")).toBe("regular");
      expect(normalizeSchedule(null)).toBe("regular");
    });
  });

  describe("normalizeUnitsPerPack", () => {
    it("extracts tablet and strip counts", () => {
      expect(normalizeUnitsPerPack("15 TAB")).toBe(15);
      expect(normalizeUnitsPerPack("15'S")).toBe(15);
      expect(normalizeUnitsPerPack("10 CAP")).toBe(10);
      expect(normalizeUnitsPerPack("10")).toBe(10);
      expect(normalizeUnitsPerPack("10 x 10")).toBe(100);
      expect(normalizeUnitsPerPack("1x10")).toBe(10);
      expect(normalizeUnitsPerPack("200 ML")).toBe(1);
      expect(normalizeUnitsPerPack(null)).toBe(1);
    });
  });
});
