import { describe, it, expect } from "vitest";
import { getIstDayBounds } from "@/lib/date-range";

describe("getIstDayBounds", () => {
  it("computes exact 24-hour UTC boundaries for an IST calendar date", () => {
    const { start, end } = getIstDayBounds("2026-11-25");
    // 2026-11-25 00:00:00 IST = 2026-11-24 18:30:00.000Z
    expect(start.toISOString()).toBe("2026-11-24T18:30:00.000Z");
    // 2026-11-26 00:00:00 IST = 2026-11-25 18:30:00.000Z
    expect(end.toISOString()).toBe("2026-11-25T18:30:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
