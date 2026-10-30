import { describe, expect, it } from "vitest";
import { HeldSaleItemSchema, HoldSaleInputSchema } from "@/server/domain/sales/held";

describe("Held Sales Schemas (Unit)", () => {
  const validItem = {
    medicineId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    medicineName: "Paracetamol 500mg",
    batchId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
    batchNo: "B-101",
    expiryDate: "2027-12-31",
    packQty: 2,
    looseQty: 3,
    unitsPerPack: 10,
    packUnit: "strip",
    looseUnit: "tablet",
    rate: 5000,
    mrp: 6000,
    discountBp: 500,
    gstRateBp: 500,
    isAutoFefo: true,
  };

  it("validates valid held sale item with unit conversion", () => {
    const parsed = HeldSaleItemSchema.parse(validItem);
    expect(parsed.medicineName).toBe("Paracetamol 500mg");
    expect(parsed.packQty).toBe(2);
    expect(parsed.looseQty).toBe(3);
    expect(parsed.unitsPerPack).toBe(10);
  });

  it("fails if required fields are missing in held sale item", () => {
    expect(() => HeldSaleItemSchema.parse({ ...validItem, medicineId: "invalid-uuid" })).toThrow();
    expect(() => HeldSaleItemSchema.parse({ ...validItem, rate: -10 })).toThrow();
    expect(() => HeldSaleItemSchema.parse({ ...validItem, unitsPerPack: 0 })).toThrow();
  });

  it("validates hold sale input with items", () => {
    const input = {
      customerName: "Ramesh Sharma",
      customerPhone: "9876543210",
      doctorName: "Dr. A. K. Gupta",
      notes: "Customer went to ATM",
      items: [validItem],
    };

    const parsed = HoldSaleInputSchema.parse(input);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.notes).toBe("Customer went to ATM");
  });

  it("rejects empty bill", () => {
    const emptyInput = {
      customerName: "Ramesh Sharma",
      items: [],
    };

    expect(() => HoldSaleInputSchema.parse(emptyInput)).toThrow("Cannot hold an empty bill");
  });
});
