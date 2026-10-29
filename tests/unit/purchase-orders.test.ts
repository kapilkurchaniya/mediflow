import { describe, expect, it } from "vitest";
import {
  CreatePurchaseOrderSchema,
  PurchaseOrderItemInputSchema,
} from "@/server/domain/purchasing/purchase-orders";

const mockSupplierId = "11111111-1111-4111-a111-111111111111";
const mockMedId1 = "22222222-2222-4222-a222-222222222222";
const mockMedId2 = "33333333-3333-4333-a333-333333333333";

describe("Purchase Orders Domain & Validation (B2.2)", () => {
  it("validates a complete purchase order input", () => {
    const valid = {
      supplierId: mockSupplierId,
      expectedDate: "2026-11-15",
      notes: "Urgent shipment for chronic patient requests",
      items: [
        {
          medicineId: mockMedId1,
          qty: 100,
          freeQty: 10,
          rate: 5500, // ₹55.00 in paise
        },
        {
          medicineId: mockMedId2,
          qty: 50,
          freeQty: 0,
          rate: 12000, // ₹120.00 in paise
        },
      ],
    };

    const parsed = CreatePurchaseOrderSchema.parse(valid);
    expect(parsed.supplierId).toBe(valid.supplierId);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0].qty).toBe(100);
    expect(parsed.items[0].freeQty).toBe(10);
    expect(parsed.items[0].rate).toBe(5500);

    const estimatedTotal = parsed.items.reduce((sum, item) => sum + item.qty * item.rate, 0);
    expect(estimatedTotal).toBe(100 * 5500 + 50 * 12000); // 550,000 + 600,000 = 1,150,000 paise (₹11,500)
  });

  it("rejects an empty item list", () => {
    const invalid = {
      supplierId: mockSupplierId,
      items: [],
    };

    expect(() => CreatePurchaseOrderSchema.parse(invalid)).toThrow("At least one item is required");
  });

  it("rejects negative or zero item quantities", () => {
    expect(() =>
      PurchaseOrderItemInputSchema.parse({
        medicineId: mockMedId1,
        qty: 0,
        freeQty: 0,
        rate: 5000,
      })
    ).toThrow("Quantity must be positive");

    expect(() =>
      PurchaseOrderItemInputSchema.parse({
        medicineId: mockMedId1,
        qty: -5,
        freeQty: 0,
        rate: 5000,
      })
    ).toThrow("Quantity must be positive");
  });

  it("rejects negative free quantity or negative rate", () => {
    expect(() =>
      PurchaseOrderItemInputSchema.parse({
        medicineId: mockMedId1,
        qty: 10,
        freeQty: -1,
        rate: 5000,
      })
    ).toThrow("Free quantity cannot be negative");

    expect(() =>
      PurchaseOrderItemInputSchema.parse({
        medicineId: mockMedId1,
        qty: 10,
        freeQty: 0,
        rate: -100,
      })
    ).toThrow("Rate in paise cannot be negative");
  });

  it("rejects invalid expectedDate formats", () => {
    expect(() =>
      CreatePurchaseOrderSchema.parse({
        supplierId: mockSupplierId,
        expectedDate: "15-11-2026", // should be YYYY-MM-DD
        items: [
          {
            medicineId: mockMedId1,
            qty: 10,
            freeQty: 0,
            rate: 5000,
          },
        ],
      })
    ).toThrow("Expected date must be YYYY-MM-DD");
  });
});
