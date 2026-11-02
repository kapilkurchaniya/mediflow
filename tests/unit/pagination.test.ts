import { describe, expect, it } from "vitest";
import { getPaginationRange, buildPageHref } from "@/app/components/Pagination";

describe("Pagination Utility & Range Engine (Task P2-T03)", () => {
  it("renders all pages when totalPages <= 7", () => {
    expect(getPaginationRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPaginationRange(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("adds trailing ellipsis when current page is near the start", () => {
    const range = getPaginationRange(2, 20);
    expect(range).toEqual([1, 2, 3, 4, 5, "...", 20]);
  });

  it("adds leading and trailing ellipsis when current page is in the middle", () => {
    const range = getPaginationRange(10, 20);
    expect(range).toEqual([1, "...", 9, 10, 11, "...", 20]);
  });

  it("adds leading ellipsis when current page is near the end", () => {
    const range = getPaginationRange(18, 20);
    expect(range).toEqual([1, "...", 16, 17, 18, 19, 20]);
  });

  it("builds correct URL query strings preserving search filters", () => {
    // Page 1 omits ?page=1
    expect(buildPageHref("/dashboard/inventory", 1)).toBe("/dashboard/inventory");

    // Page 2 adds ?page=2
    expect(buildPageHref("/dashboard/inventory", 2)).toBe("/dashboard/inventory?page=2");

    // Preserves query filters
    expect(
      buildPageHref("/dashboard/inventory", 3, { q: "paracetamol", category: "tablets" })
    ).toBe("/dashboard/inventory?q=paracetamol&category=tablets&page=3");

    // Removes undefined or empty params
    expect(
      buildPageHref("/dashboard/inventory", 1, { q: "amlo", empty: undefined, emptyStr: "" })
    ).toBe("/dashboard/inventory?q=amlo");
  });
});

