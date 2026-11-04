import { describe, expect, it } from "vitest";
import { determineStatutoryRouting } from "@/server/domain/inventory/transfers/statutory";
import {
  CreateTransferSchema,
  ReceiveTransferSchema,
} from "@/server/domain/inventory/transfers/types";

describe("Stock Transfers - Statutory Routing (GST Rule 55 vs Rule 46)", () => {
  const storeA = {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Main Pharmacy MH",
    address: "Pune, Maharashtra",
    gstin: "27AAAAA0000A1Z5",
    stateCode: "27",
  };

  const storeB_SameGstin = {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Branch Pharmacy MH",
    address: "Mumbai, Maharashtra",
    gstin: "27AAAAA0000A1Z5", // Same GSTIN
    stateCode: "27",
  };

  const storeC_DifferentGstin_SameState = {
    id: "33333333-3333-3333-3333-333333333333",
    name: "Warehouse MH Distinct",
    address: "Nagpur, Maharashtra",
    gstin: "27BBBBB1111B1Z2", // Different GSTIN in same state (Sec 25(4))
    stateCode: "27",
  };

  const storeD_InterState = {
    id: "44444444-4444-4444-4444-444444444444",
    name: "Bangalore Branch KA",
    address: "Bangalore, Karnataka",
    gstin: "29CCCCC2222C1Z9", // Karnataka GSTIN
    stateCode: "29",
  };

  it("intra-GSTIN movement routes to Rule 55 Delivery Challan without GST liability", () => {
    const items = [
      { qty: 10, unitCost: 10000, gstRateBp: 1200 }, // 10 * ₹100 = ₹1,000 (100,000 paise)
      { qty: 5, unitCost: 20000, gstRateBp: 1800 },  // 5 * ₹200 = ₹1,000 (100,000 paise)
    ];

    const result = determineStatutoryRouting(storeA, storeB_SameGstin, items);

    expect(result.docKind).toBe("delivery_challan");
    expect(result.isSupply).toBe(false);
    expect(result.taxableValuePaise).toBe(200000);
    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.igstPaise).toBe(0);
    expect(result.totalValuePaise).toBe(200000);
    expect(result.eWayBillRequired).toBe(false);
  });

  it("cross-GSTIN inter-state transfer routes to Rule 46 Tax Invoice with IGST", () => {
    const items = [
      { qty: 10, unitCost: 10000, gstRateBp: 1200 }, // Taxable: 100,000 paise. IGST (12%) = 12,000 paise
    ];

    const result = determineStatutoryRouting(storeA, storeD_InterState, items);

    expect(result.docKind).toBe("tax_invoice");
    expect(result.isSupply).toBe(true);
    expect(result.isInterState).toBe(true);
    expect(result.placeOfSupply).toBe("29");
    expect(result.taxableValuePaise).toBe(100000);
    expect(result.cgstPaise).toBe(0);
    expect(result.sgstPaise).toBe(0);
    expect(result.igstPaise).toBe(12000);
    expect(result.totalValuePaise).toBe(112000);
  });

  it("cross-GSTIN intra-state deemed supply routes to Rule 46 Tax Invoice with split CGST + SGST", () => {
    const items = [
      { qty: 10, unitCost: 10000, gstRateBp: 1200 }, // Taxable: 100,000 paise. CGST (6%) = 6,000, SGST (6%) = 6,000
    ];

    const result = determineStatutoryRouting(storeA, storeC_DifferentGstin_SameState, items);

    expect(result.docKind).toBe("tax_invoice");
    expect(result.isSupply).toBe(true);
    expect(result.isInterState).toBe(false);
    expect(result.taxableValuePaise).toBe(100000);
    expect(result.cgstPaise).toBe(6000);
    expect(result.sgstPaise).toBe(6000);
    expect(result.igstPaise).toBe(0);
    expect(result.totalValuePaise).toBe(112000);
  });

  it("flags eWayBillRequired = true when consignment value exceeds ₹50,000 (CGST Rule 138)", () => {
    // 500 units @ ₹120 = ₹60,000 (6,000,000 paise) > ₹50,000 (5,000,000 paise)
    const items = [{ qty: 500, unitCost: 12000, gstRateBp: 1200 }];

    const result = determineStatutoryRouting(storeA, storeB_SameGstin, items);

    expect(result.totalValuePaise).toBe(6000000);
    expect(result.eWayBillRequired).toBe(true);
  });

  it("flags eWayBillRequired = false when consignment value is exactly or under ₹50,000", () => {
    // 400 units @ ₹100 = ₹40,000 (4,000,000 paise) < ₹50,000
    const items = [{ qty: 400, unitCost: 10000, gstRateBp: 1200 }];

    const result = determineStatutoryRouting(storeA, storeB_SameGstin, items);

    expect(result.totalValuePaise).toBe(4000000);
    expect(result.eWayBillRequired).toBe(false);
  });
});

describe("Stock Transfers - Zod Schemas & Invariant Validation", () => {
  const store1 = "11111111-1111-4111-8111-111111111111";
  const store2 = "22222222-2222-4222-8222-222222222222";
  const med1 = "33333333-3333-4333-8333-333333333333";
  const batch1 = "44444444-4444-4444-8444-444444444444";
  const item1 = "55555555-5555-4555-8555-555555555555";

  it("rejects transfer when source and destination stores are identical", () => {
    const res = CreateTransferSchema.safeParse({
      fromStoreId: store1,
      toStoreId: store1, // Identical
      items: [{ medicineId: med1, fromBatchId: batch1, qty: 5 }],
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toMatch(/cannot be the same/i);
    }
  });

  it("rejects transfer when items list is empty", () => {
    const res = CreateTransferSchema.safeParse({
      fromStoreId: store1,
      toStoreId: store2,
      items: [],
    });

    expect(res.success).toBe(false);
  });

  it("rejects line item with non-positive quantity", () => {
    const res = CreateTransferSchema.safeParse({
      fromStoreId: store1,
      toStoreId: store2,
      items: [{ medicineId: med1, fromBatchId: batch1, qty: 0 }],
    });

    expect(res.success).toBe(false);
  });

  it("rejects receipt when all quantities (received, damaged, shortage) are zero", () => {
    const res = ReceiveTransferSchema.safeParse({
      transferId: store1,
      idempotencyKey: "idem-key-1",
      items: [
        {
          itemId: item1,
          qtyReceived: 0,
          qtyDamaged: 0,
          qtyShortage: 0,
        },
      ],
    });

    expect(res.success).toBe(false);
  });

  it("accepts valid receipt with accepted and damaged stock", () => {
    const res = ReceiveTransferSchema.safeParse({
      transferId: store1,
      idempotencyKey: "idem-key-1",
      items: [
        {
          itemId: item1,
          qtyReceived: 8,
          qtyDamaged: 2,
          qtyShortage: 0,
          discrepancyReason: "Broken carton during transit",
        },
      ],
    });

    expect(res.success).toBe(true);
  });
});
