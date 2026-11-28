import { describe, expect, it } from "vitest";
import { buildStoreAlertItems } from "@/server/domain/notifications/alerts";

describe("buildStoreAlertItems", () => {
  it("returns empty array when no alert conditions trigger", () => {
    const res = buildStoreAlertItems({
      outOfStockItems: [],
      lowStockItems: [],
      expiring30Count: 0,
      expiring90Count: 0,
      pendingUdhaarPaise: 0,
      pendingUdhaarCustomers: 0,
      pdcDueSoonCount: 0,
      openConflictsCount: 0,
      promiseOrdersReadyCount: 0,
    });
    expect(res).toEqual([]);
  });

  it("builds out-of-stock, low-stock, expiry, udhaar, pdc, conflict, and promise alerts", () => {
    const res = buildStoreAlertItems({
      outOfStockItems: [{ name: "Dolo 650", minQty: 15 }],
      lowStockItems: [{ name: "Augmentin 625", onHand: 4, minQty: 10 }],
      expiring30Count: 2,
      expiring90Count: 5,
      pendingUdhaarPaise: 4000,
      pendingUdhaarCustomers: 1,
      pdcDueSoonCount: 3,
      openConflictsCount: 1,
      promiseOrdersReadyCount: 2,
    });

    expect(res.map((a) => a.id)).toEqual([
      "out-of-stock",
      "low-stock",
      "near-expiry",
      "stock-conflicts",
      "customer-udhaar",
      "pdc-due",
      "promise-ready",
    ]);
    expect(res[0].href).toContain("/dashboard/purchases/reorder");
    expect(res[1].message).toContain("Augmentin 625 (4/10)");
    expect(res[2].type).toBe("danger");
    expect(res[4].message).toContain("40.00");
  });
});
