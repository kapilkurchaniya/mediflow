import { describe, it, expect } from "vitest";
import { formatISTDate, formatISTDateTime, formatISTTime } from "@/lib/format";

describe("IST date and time formatters", () => {
  it("converts UTC timestamps to Asia/Kolkata (+05:30) regardless of server timezone", () => {
    // 17:31 UTC = 23:01 IST (11:01 PM) on 23 November 2026
    const instant = new Date("2026-11-23T17:31:00.000Z");
    expect(formatISTDateTime(instant, "long")).toBe("23 November 2026, 11:01 PM");
    expect(formatISTDateTime(instant, "short")).toBe("23 Nov 2026, 11:01 PM");
    expect(formatISTDateTime(instant, "compact")).toBe("23/11/26 23:01");
    expect(formatISTDateTime(instant, "numeric")).toBe("23/11/2026 23:01");
    expect(formatISTDate(instant, "medium")).toBe("23 Nov 2026");
    expect(formatISTDate(instant, "numeric")).toBe("23/11/2026");
    expect(formatISTDate(instant, "compact")).toBe("23/11/26");
    expect(formatISTTime(instant)).toBe("11:01 PM");
  });

  it("handles IST midnight date rollover accurately", () => {
    // 19:00 UTC on Nov 23 = 00:30 AM IST on Nov 24
    const afterMidnightIST = "2026-11-23T19:00:00.000Z";
    expect(formatISTDate(afterMidnightIST, "medium")).toBe("24 Nov 2026");
    expect(formatISTDateTime(afterMidnightIST, "long")).toBe("24 November 2026, 12:30 AM");
  });

  it("returns em-dash for invalid dates", () => {
    expect(formatISTDateTime("not-a-date")).toBe("—");
    expect(formatISTDate("not-a-date")).toBe("—");
    expect(formatISTTime("not-a-date")).toBe("—");
  });
});

