import { describe, it, expect } from "vitest";
import { normalizeDrugSchedule, scheduleRequiresRx } from "@/lib/schedule";
import { normalizeExpiryDate } from "@/server/domain/import/normalize";

describe("Indian Drug Schedule Normalization", () => {
  it("normalizes Apollo & distributor invoice schedule notations cleanly", () => {
    expect(normalizeDrugSchedule("H")).toBe("H");
    expect(normalizeDrugSchedule("G & H")).toBe("H");
    expect(normalizeDrugSchedule("G&H")).toBe("H");
    expect(normalizeDrugSchedule("Sch H")).toBe("H");
    expect(normalizeDrugSchedule("Schedule H1")).toBe("H1");
    expect(normalizeDrugSchedule("H-1")).toBe("H1");
    expect(normalizeDrugSchedule("H & H1")).toBe("H1");
    expect(normalizeDrugSchedule("X")).toBe("X");
    expect(normalizeDrugSchedule("NDPS")).toBe("narcotic");
    expect(normalizeDrugSchedule("G")).toBe("G");
    expect(normalizeDrugSchedule("OTC")).toBe("none");
    expect(normalizeDrugSchedule("")).toBe("none");
    expect(normalizeDrugSchedule(null)).toBe("none");
  });

  it("flags Schedule H, H1, X, and narcotic as Rx required", () => {
    expect(scheduleRequiresRx("H")).toBe(true);
    expect(scheduleRequiresRx("G & H")).toBe(true);
    expect(scheduleRequiresRx("H1")).toBe(true);
    expect(scheduleRequiresRx("X")).toBe(true);
    expect(scheduleRequiresRx("narcotic")).toBe(true);
    expect(scheduleRequiresRx("G")).toBe(false);
    expect(scheduleRequiresRx("none")).toBe(false);
  });

  it("parses DD MMM YY expiry dates printed on Apollo bills", () => {
    expect(normalizeExpiryDate("30 Sep 28")).toEqual({ success: true, date: "2028-09-30" });
    expect(normalizeExpiryDate("30 Nov 27")).toEqual({ success: true, date: "2027-11-30" });
    expect(normalizeExpiryDate("29 Feb 28")).toEqual({ success: true, date: "2028-02-29" });
    expect(normalizeExpiryDate("31 Oct 27")).toEqual({ success: true, date: "2027-10-31" });
    expect(normalizeExpiryDate("31 Dec 28")).toEqual({ success: true, date: "2028-12-31" });
  });
});
