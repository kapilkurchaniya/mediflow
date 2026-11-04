import { describe, expect, it } from "vitest";
import { calculateEWayBillValidityDays } from "@/server/domain/e-invoice";

describe("E-Way Bill Statutory Validity Calculation (CGST Notification No. 94/2020-CT)", () => {
  it("allocates exactly 1 day for distances up to 200 km", () => {
    expect(calculateEWayBillValidityDays(1)).toBe(1);
    expect(calculateEWayBillValidityDays(50)).toBe(1);
    expect(calculateEWayBillValidityDays(199)).toBe(1);
    expect(calculateEWayBillValidityDays(200)).toBe(1);
  });

  it("allocates 2 days as soon as distance exceeds 200 km (e.g. 201 km)", () => {
    expect(calculateEWayBillValidityDays(201)).toBe(2);
    expect(calculateEWayBillValidityDays(300)).toBe(2);
    expect(calculateEWayBillValidityDays(400)).toBe(2);
  });

  it("allocates 3 days for intermediate inter-state routes (e.g. 450 km)", () => {
    expect(calculateEWayBillValidityDays(401)).toBe(3);
    expect(calculateEWayBillValidityDays(450)).toBe(3);
    expect(calculateEWayBillValidityDays(600)).toBe(3);
  });

  it("scales correctly for long-haul routes (e.g. 1000 km = 5 days)", () => {
    expect(calculateEWayBillValidityDays(1000)).toBe(5);
    expect(calculateEWayBillValidityDays(1001)).toBe(6);
  });

  it("enforces a statutory minimum of 1 day for 0 or negative distances", () => {
    expect(calculateEWayBillValidityDays(0)).toBe(1);
    expect(calculateEWayBillValidityDays(-25)).toBe(1);
  });
});

