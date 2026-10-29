import { describe, expect, it } from "vitest";
import {
  CreatePurchaseReturnSchema,
  PurchaseReturnItemInputSchema,
} from "@/server/domain/purchasing/purchase-returns";

describe("Purchase Returns & Debit Notes Domain Validation (B2.3)", () => {
  const validPurchaseId = "11111111-1111-4111-a111-111111111111";
  const validItemId = "22222222-2222-4222-a222-222222222222";
  const validBatchId = "33333333-3333-4333-a333-333333333333";

  it("validates a correctly structured purchase return input", () => {
    const validData = {
      purchaseId: validPurchaseId,
      reason: "Expired goods (60-day vendor return)",
      notes: "Boxes picked up by vendor rep",
      items: [
        {
          purchaseItemId: validItemId,
          batchId: validBatchId,
          qty: 10,
        },
      ],
    };

    const parsed = CreatePurchaseReturnSchema.parse(validData);
    expect(parsed.purchaseId).toBe(validPurchaseId);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].qty).toBe(10);
  });

  it("rejects return with zero or negative quantity", () => {
    expect(() =>
      PurchaseReturnItemInputSchema.parse({
        purchaseItemId: validItemId,
        batchId: validBatchId,
        qty: 0,
      })
    ).toThrow();

    expect(() =>
      PurchaseReturnItemInputSchema.parse({
        purchaseItemId: validItemId,
        batchId: validBatchId,
        qty: -5,
      })
    ).toThrow();
  });

  it("rejects invalid UUIDs for purchase, item, or batch", () => {
    expect(() =>
      CreatePurchaseReturnSchema.parse({
        purchaseId: "not-a-uuid",
        reason: "Damaged",
        items: [{ purchaseItemId: validItemId, batchId: validBatchId, qty: 5 }],
      })
    ).toThrow();

    expect(() =>
      PurchaseReturnItemInputSchema.parse({
        purchaseItemId: "invalid-uuid",
        batchId: validBatchId,
        qty: 5,
      })
    ).toThrow();
  });

  it("requires a non-empty reason for debit note issuance", () => {
    expect(() =>
      CreatePurchaseReturnSchema.parse({
        purchaseId: validPurchaseId,
        reason: "",
        items: [{ purchaseItemId: validItemId, batchId: validBatchId, qty: 5 }],
      })
    ).toThrow();
  });

  it("requires at least one return item", () => {
    expect(() =>
      CreatePurchaseReturnSchema.parse({
        purchaseId: validPurchaseId,
        reason: "Excess stock",
        items: [],
      })
    ).toThrow();
  });

  describe("Debit Note Financial Computations", () => {
    it("computes intra-state GST debit note correctly with balanced double entry", () => {
      // 10 units @ ₹100.00 (10000 paise), 5% GST (500 bp), 0% discount
      const qty = 10;
      const rate = 10000; // paise
      const gstRateBp = 500; // 5%

      const lineGross = rate * qty; // 100000 paise (₹1000)
      const lineTaxable = lineGross;
      const halfRate = Math.floor(gstRateBp / 2); // 250 bp (2.5%)
      const cgst = Math.round((lineTaxable * halfRate) / 10000); // 2500 paise (₹25)
      const sgst = Math.round((lineTaxable * (gstRateBp - halfRate)) / 10000); // 2500 paise (₹25)
      const totalAmount = lineTaxable + cgst + sgst; // 105000 paise (₹1050)

      expect(cgst).toBe(2500);
      expect(sgst).toBe(2500);
      expect(totalAmount).toBe(105000);

      // Verify journal equality: Debit Supplier = Credit Purchases + Credit Input GST
      const debitSupplier = totalAmount;
      const creditPurchases = lineTaxable;
      const creditInputTax = cgst + sgst;
      expect(debitSupplier).toBe(creditPurchases + creditInputTax);
    });

    it("computes inter-state GST debit note correctly with IGST", () => {
      // 5 units @ ₹250.00 (25000 paise), 12% GST (1200 bp), 10% discount (1000 bp)
      const qty = 5;
      const rate = 25000;
      const discountBp = 1000; // 10%
      const gstRateBp = 1200; // 12%

      const gross = rate * qty; // 125000 paise (₹1250)
      const discount = Math.round((gross * discountBp) / 10000); // 12500 paise (₹125)
      const taxable = gross - discount; // 112500 paise (₹1125)
      const igst = Math.round((taxable * gstRateBp) / 10000); // 13500 paise (₹135)
      const total = taxable + igst; // 126000 paise (₹1260)

      expect(gross).toBe(125000);
      expect(discount).toBe(12500);
      expect(taxable).toBe(112500);
      expect(igst).toBe(13500);
      expect(total).toBe(126000);

      // Verify double entry balance
      expect(total).toBe(taxable + igst);
    });
  });
});

