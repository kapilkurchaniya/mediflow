import { describe, expect, it } from "vitest";
import {
  getMedicineSegmentLabel,
  normalizeMedicineSegment,
} from "@/lib/inventory/medicine-segments";
import { computeUdhaarSummary } from "@/lib/receivables/udhaar-summary";
import { summarizeSupplierHistory } from "@/server/domain/purchasing/supplier-history";

describe("medicine segments", () => {
  it("normalizes valid segments and defaults unknown to general", () => {
    expect(normalizeMedicineSegment("Kids")).toBe("kids");
    expect(normalizeMedicineSegment("female")).toBe("female");
    expect(normalizeMedicineSegment("MALE")).toBe("male");
    expect(normalizeMedicineSegment("unknown")).toBe("general");
    expect(getMedicineSegmentLabel("kids")).toBe("Kids / Pediatric");
  });
});

describe("udhaar summary", () => {
  it("sums only customers with positive pending dues", () => {
    const res = computeUdhaarSummary([
      { id: "1", name: "A", phone: null, duePaise: 4000, openBills: 1 },
      { id: "2", name: "B", phone: null, duePaise: 0, openBills: 0 },
      { id: "3", name: "C", phone: null, duePaise: 12500, openBills: 2 },
    ]);
    expect(res).toEqual({
      totalToCollectPaise: 16500,
      customersWithDueCount: 2,
      openBillsCount: 3,
    });
  });
});

describe("supplier history comparison", () => {
  it("identifies the lowest landed cost supplier and distinct supplier count", () => {
    const summary = summarizeSupplierHistory([
      {
        purchaseId: "p1",
        purchaseNo: "PUR-1",
        supplierInvoiceNo: "INV-1",
        invoiceDate: "2026-11-20",
        supplierId: "s1",
        supplierName: "Alpha Pharma",
        contactPerson: "Raj",
        phone: "9999999999",
        qty: 100,
        freeQty: 10,
        schemeType: "10+1",
        discountBp: 500,
        ratePaise: 1500,
        landedUnitCostPaise: 1320,
        mrpPaise: 2000,
      },
      {
        purchaseId: "p2",
        purchaseNo: "PUR-2",
        supplierInvoiceNo: "INV-2",
        invoiceDate: "2026-11-10",
        supplierId: "s2",
        supplierName: "Beta Distributors",
        contactPerson: null,
        phone: "8888888888",
        qty: 50,
        freeQty: 0,
        schemeType: null,
        discountBp: 0,
        ratePaise: 1200,
        landedUnitCostPaise: 1260,
        mrpPaise: 2000,
      },
    ]);

    expect(summary.bestRatePaise).toBe(1260);
    expect(summary.bestSupplierId).toBe("s2");
    expect(summary.bestSupplierName).toBe("Beta Distributors");
    expect(summary.latestRatePaise).toBe(1500);
    expect(summary.supplierCount).toBe(2);
  });
});
