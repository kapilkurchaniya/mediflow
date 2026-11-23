import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildPosSearchPatterns } from "@/server/domain/pos/search";
import {
  clearPosSearchCache,
  defaultPosDataSource,
  filterCachedSearchResults,
  lookupInstantPosSearchCache,
  type SearchResult,
} from "@/app/dashboard/sales/pos/_data/posData";

function makeItem(id: string, name: string, genericName: string | null = null): SearchResult {
  return {
    medicine: {
      id,
      name,
      genericName,
      gstRateBp: 500,
    },
    batches: [
      {
        id: `batch-${id}`,
        batchNo: "B1",
        expiryDate: "2028-12-31",
        qtyOnHand: 10,
        mrp: 5000,
        saleRate: 4500,
      },
    ],
  };
}

describe("POS Search Performance Helpers", () => {
  beforeEach(() => {
    clearPosSearchCache();
    vi.restoreAllMocks();
  });

  it("builds multi-token ILIKE patterns and escapes SQL wildcards", () => {
    expect(buildPosSearchPatterns("dolo 650")).toEqual({
      lowerQuery: "dolo 650",
      pattern: "%dolo%650%",
      prefixPattern: "dolo%650%",
    });
  });

  it("escapes %, _, and \\ characters in search tokens", () => {
    const res = buildPosSearchPatterns("100% pure_vit\\a");
    expect(res.pattern).toBe("%100\\%%pure\\_vit\\\\a%");
    expect(res.prefixPattern).toBe("100\\%%pure\\_vit\\\\a%");
  });

  it("filters cached results locally for multi-word queries", () => {
    const items = [
      makeItem("1", "Dolo-650 Tablet", "Paracetamol 650mg"),
      makeItem("2", "Dolo-500 Tablet", "Paracetamol 500mg"),
      makeItem("3", "Dolonex DT", "Piroxicam"),
    ];
    expect(filterCachedSearchResults(items, "dolo 650").map((i) => i.medicine.id)).toEqual(["1"]);
    expect(filterCachedSearchResults(items, "paracet").map((i) => i.medicine.id)).toEqual(["1", "2"]);
  });

  it("narrows complete prefix cache hits without issuing a second fetch", async () => {
    const doloItems = [
      makeItem("1", "Dolo-650 Tablet", "Paracetamol 650mg"),
      makeItem("2", "Dolo-500 Tablet", "Paracetamol 500mg"),
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, items: doloItems }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await defaultPosDataSource.searchItems("dolo");
    expect(first).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // "dolo 650" is narrowed locally from "dolo" because "dolo" returned < 25 items
    const instant = lookupInstantPosSearchCache("dolo 650");
    expect(instant?.map((i) => i.medicine.id)).toEqual(["1"]);

    const second = await defaultPosDataSource.searchItems("dolo 650");
    expect(second.map((i) => i.medicine.id)).toEqual(["1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not narrow locally when prefix hit was truncated at limit (25 items)", async () => {
    const fullPage = Array.from({ length: 25 }, (_, i) => makeItem(String(i), `Para ${i}`));
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, items: fullPage }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await defaultPosDataSource.searchItems("par");
    expect(lookupInstantPosSearchCache("para")).toBeNull();

    await defaultPosDataSource.searchItems("para");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
