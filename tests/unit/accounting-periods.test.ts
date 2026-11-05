import { describe, expect, it } from "vitest";
import {
  calculateIndianFY,
  formatPeriodKey,
  getPeriodDateRange,
  getMonthsForIndianFY,
  getCurrentIndianFY,
  getISTDateParts,
} from "@/server/domain/accounting-periods/period-resolver";
import { PeriodLockedError } from "@/server/domain/accounting-periods/types";

describe("Accounting Periods Domain Unit Tests", () => {
  describe("Indian Financial Year Calculation (Asia/Kolkata)", () => {
    it("resolves April 1st to the new Financial Year", () => {
      const fyInfo = calculateIndianFY("2026-04-01");
      expect(fyInfo.financialYear).toBe("2026-2027");
      expect(fyInfo.startYear).toBe(2026);
      expect(fyInfo.endYear).toBe(2027);
    });

    it("resolves mid-year months to the current Financial Year", () => {
      const fyInfo = calculateIndianFY("2026-10-15");
      expect(fyInfo.financialYear).toBe("2026-2027");
    });

    it("resolves December 31st to the ongoing Financial Year", () => {
      const fyInfo = calculateIndianFY("2026-12-31");
      expect(fyInfo.financialYear).toBe("2026-2027");
    });

    it("resolves January 1st to the second half of the ongoing Financial Year", () => {
      const fyInfo = calculateIndianFY("2027-01-01");
      expect(fyInfo.financialYear).toBe("2026-2027");
      expect(fyInfo.startYear).toBe(2026);
      expect(fyInfo.endYear).toBe(2027);
    });

    it("resolves March 31st to the closing of the Financial Year", () => {
      const fyInfo = calculateIndianFY("2027-03-31");
      expect(fyInfo.financialYear).toBe("2026-2027");
    });

    it("resolves March 31st of previous year to the previous Financial Year", () => {
      const fyInfo = calculateIndianFY("2026-03-31");
      expect(fyInfo.financialYear).toBe("2025-2026");
    });

    it("handles Date objects correctly in IST timezone", () => {
      const d = new Date("2026-04-01T00:00:00+05:30");
      const fyInfo = calculateIndianFY(d);
      expect(fyInfo.financialYear).toBe("2026-2027");
    });

    it("extracts IST calendar date parts accurately", () => {
      const parts = getISTDateParts("2026-08-15");
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(8);
      expect(parts.day).toBe(15);
    });
  });

  describe("Period Key & Date Range Formatting", () => {
    it("formats dates into YYYY-MM period keys", () => {
      expect(formatPeriodKey("2026-04-05")).toBe("2026-04");
      expect(formatPeriodKey("2027-02-28")).toBe("2027-02");
    });

    it("returns accurate start and end dates for standard 30-day months", () => {
      const range = getPeriodDateRange("2026-04");
      expect(range.startDate).toBe("2026-04-01");
      expect(range.endDate).toBe("2026-04-30");
    });

    it("returns accurate start and end dates for 31-day months", () => {
      const range = getPeriodDateRange("2026-05");
      expect(range.startDate).toBe("2026-05-01");
      expect(range.endDate).toBe("2026-05-31");
    });

    it("handles February in non-leap year (28 days)", () => {
      const range = getPeriodDateRange("2027-02");
      expect(range.startDate).toBe("2027-02-01");
      expect(range.endDate).toBe("2027-02-28");
    });

    it("handles February in leap year (29 days)", () => {
      const range = getPeriodDateRange("2028-02");
      expect(range.startDate).toBe("2028-02-01");
      expect(range.endDate).toBe("2028-02-29");
    });
  });

  describe("Financial Year Months Structure", () => {
    it("generates exact 12 chronological periods from April to March", () => {
      const months = getMonthsForIndianFY("2026-2027");
      expect(months).toHaveLength(12);

      expect(months[0]?.periodKey).toBe("2026-04");
      expect(months[0]?.monthIndex).toBe(1);
      expect(months[0]?.startDate).toBe("2026-04-01");
      expect(months[0]?.endDate).toBe("2026-04-30");

      expect(months[8]?.periodKey).toBe("2026-12");
      expect(months[8]?.monthIndex).toBe(9);

      expect(months[9]?.periodKey).toBe("2027-01");
      expect(months[9]?.monthIndex).toBe(10);

      expect(months[11]?.periodKey).toBe("2027-03");
      expect(months[11]?.monthIndex).toBe(12);
      expect(months[11]?.startDate).toBe("2027-03-01");
      expect(months[11]?.endDate).toBe("2027-03-31");
    });

    it("returns a valid current Indian FY string", () => {
      const currentFY = getCurrentIndianFY();
      expect(currentFY).toMatch(/^\d{4}-\d{4}$/);
      const [start, end] = currentFY.split("-").map(Number);
      expect(end - start).toBe(1);
    });
  });

  describe("PeriodLockedError", () => {
    it("instantiates with rich metadata", () => {
      const err = new PeriodLockedError("Tenant period 2026-04 is locked", {
        periodKey: "2026-04",
        financialYear: "2026-2027",
        gstin: "27AABCU9603R1ZM",
        lockedAt: "2026-05-01T10:00:00.000Z",
      });

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(PeriodLockedError);
      expect(err.name).toBe("PeriodLockedError");
      expect(err.periodKey).toBe("2026-04");
      expect(err.financialYear).toBe("2026-2027");
      expect(err.gstin).toBe("27AABCU9603R1ZM");
      expect(err.lockedAt).toBe("2026-05-01T10:00:00.000Z");
      expect(err.message).toBe("Tenant period 2026-04 is locked");
    });
  });
});
