import { describe, it, expect } from "vitest";
import {
  calculateCentralPoMatrix,
  CreateCentralSplitPoSchema,
} from "@/server/domain/purchasing/central-po";

describe("Central Purchasing Split PO Matrix", () => {
  const storeA = "11111111-1111-4111-8111-111111111111";
  const storeB = "22222222-2222-4222-8222-222222222222";
  const storeC = "33333333-3333-4333-8333-333333333333";
  const supplierId = "44444444-4444-4444-8444-444444444444";
  const med1 = "55555555-5555-4555-8555-555555555555";
  const med2 = "66666666-6666-4666-8666-666666666666";

  it("calculates multi-branch quantities and paise values accurately", () => {
    const items = [
      {
        medicineId: med1,
        rate: 15000, // ₹150.00
        allocations: [
          { storeId: storeA, qty: 10, freeQty: 0 },
          { storeId: storeB, qty: 20, freeQty: 0 },
          { storeId: storeC, qty: 0, freeQty: 0 },
        ],
      },
      {
        medicineId: med2,
        rate: 5000, // ₹50.00
        allocations: [
          { storeId: storeA, qty: 5, freeQty: 0 },
          { storeId: storeB, qty: 0, freeQty: 0 },
          { storeId: storeC, qty: 30, freeQty: 0 },
        ],
      },
    ];

    const summary = calculateCentralPoMatrix(items);

    // Total Items: 2
    expect(summary.totalItems).toBe(2);

    // Total Qty: 10 + 20 + 5 + 30 = 65
    expect(summary.totalQuantity).toBe(65);

    // Total Paise:
    // med1: (10 + 20) * 15000 = 450,000 paise (₹4,500)
    // med2: (5 + 30) * 5000 = 175,000 paise (₹1,750)
    // Total = 625,000 paise (₹6,250)
    expect(summary.totalEstimatedCostPaise).toBe(625000);

    // Branch A: 10 of med1 (150,000) + 5 of med2 (25,000) = 175,000 paise, 15 qty
    expect(summary.branchTotals[storeA]).toEqual({
      totalQuantity: 15,
      totalEstimatedCostPaise: 175000,
      itemCount: 2,
    });

    // Branch B: 20 of med1 (300,000) = 300,000 paise, 20 qty
    expect(summary.branchTotals[storeB]).toEqual({
      totalQuantity: 20,
      totalEstimatedCostPaise: 300000,
      itemCount: 1,
    });

    // Branch C: 30 of med2 (150,000) = 150,000 paise, 30 qty
    expect(summary.branchTotals[storeC]).toEqual({
      totalQuantity: 30,
      totalEstimatedCostPaise: 150000,
      itemCount: 1,
    });
  });

  it("handles items with 0 allocation gracefully", () => {
    const items = [
      {
        medicineId: med1,
        rate: 10000,
        allocations: [
          { storeId: storeA, qty: 0, freeQty: 0 },
          { storeId: storeB, qty: 0, freeQty: 0 },
        ],
      },
    ];

    const summary = calculateCentralPoMatrix(items);
    expect(summary.totalItems).toBe(0);
    expect(summary.totalQuantity).toBe(0);
    expect(summary.totalEstimatedCostPaise).toBe(0);
    expect(Object.keys(summary.branchTotals).length).toBe(0);
  });

  it("validates valid split PO input schema", () => {
    const valid = {
      supplierId,
      expectedDate: "2026-11-15",
      notes: "Diwali festival stock buffer",
      items: [
        {
          medicineId: med1,
          rate: 12500,
          allocations: [{ storeId: storeA, qty: 10, freeQty: 2 }],
        },
      ],
    };

    const parsed = CreateCentralSplitPoSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid input schema (invalid UUIDs, negative numbers)", () => {
    const invalid = {
      supplierId: "not-a-uuid",
      items: [
        {
          medicineId: med1,
          rate: -50,
          allocations: [{ storeId: storeA, qty: -5 }],
        },
      ],
    };

    const parsed = CreateCentralSplitPoSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});

