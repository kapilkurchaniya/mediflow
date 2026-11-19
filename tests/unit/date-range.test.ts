import { afterEach, describe, expect, it, vi } from "vitest";
import { getISTTodayString, resolveDateRange } from "@/lib/date-range";

describe("resolveDateRange (IST calendar math)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats today accurately in IST right after IST midnight (previous UTC date)", () => {
    // 2026-11-15 00:30:00 IST == 2026-11-14 19:00:00 UTC
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T19:00:00.000Z"));

    expect(getISTTodayString()).toBe("2026-11-15");
    expect(resolveDateRange({ range: "today" })).toEqual({
      from: "2026-11-15",
      to: "2026-11-15",
    });
    expect(resolveDateRange({ range: "yesterday" })).toEqual({
      from: "2026-11-14",
      to: "2026-11-14",
    });
  });

  it("normalizes month and this_month aliases consistently", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T11:00:00.000Z"));

    expect(resolveDateRange({ range: "month" })).toEqual({
      from: "2026-11-01",
      to: "2026-11-15",
    });
    expect(resolveDateRange({ range: "this_month" })).toEqual({
      from: "2026-11-01",
      to: "2026-11-15",
    });
    expect(resolveDateRange({ range: "last-month" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(resolveDateRange({ range: "all" })).toEqual({
      from: null,
      to: null,
    });
  });
});
