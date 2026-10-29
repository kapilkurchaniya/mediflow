import { describe, expect, it } from "vitest";
import { RecordSupplierPaymentSchema } from "@/server/domain/suppliers";

describe("Supplier Ledger & Payments (B2.4)", () => {
  const validSupplierId = "11111111-1111-4111-a111-111111111111";

  it("validates a correct supplier payment input", () => {
    const validData = {
      supplierId: validSupplierId,
      amount: 500000, // ₹5,000.00
      method: "bank" as const,
      paymentDate: "2026-10-29",
      reference: "UTR987654321",
      note: "Settlement of October invoices",
    };

    const parsed = RecordSupplierPaymentSchema.parse(validData);
    expect(parsed.supplierId).toBe(validSupplierId);
    expect(parsed.amount).toBe(500000);
    expect(parsed.method).toBe("bank");
  });

  it("rejects zero or negative payment amounts", () => {
    expect(() =>
      RecordSupplierPaymentSchema.parse({
        supplierId: validSupplierId,
        amount: 0,
        method: "cash",
        paymentDate: "2026-10-29",
      })
    ).toThrow();

    expect(() =>
      RecordSupplierPaymentSchema.parse({
        supplierId: validSupplierId,
        amount: -1000,
        method: "cash",
        paymentDate: "2026-10-29",
      })
    ).toThrow();
  });

  it("rejects invalid date format", () => {
    expect(() =>
      RecordSupplierPaymentSchema.parse({
        supplierId: validSupplierId,
        amount: 10000,
        method: "upi",
        paymentDate: "29-10-2026", // must be YYYY-MM-DD
      })
    ).toThrow();
  });

  describe("Running Ledger Balance Logic", () => {
    it("correctly computes running balance across purchases, returns, and payments", () => {
      // Scenario:
      // 1. Opening balance: ₹10,000 credit (we owe supplier) = 1,000,000 paise
      // 2. Purchase GRN 1: ₹50,000 (5,000,000 paise) -> balance = ₹60,000
      // 3. Purchase Return 1: ₹5,000 (500,000 paise) -> balance = ₹55,000
      // 4. Payment 1: ₹40,000 (4,000,000 paise) -> balance = ₹15,000
      // 5. Purchase GRN 2: ₹25,000 (2,500,000 paise) -> balance = ₹40,000
      // 6. Payment 2: ₹30,000 (3,000,000 paise) -> balance = ₹10,000

      const opening = 1000000;
      const transactions = [
        { type: "purchase", credit: 5000000, debit: 0 },
        { type: "purchase_return", credit: 0, debit: 500000 },
        { type: "payment", credit: 0, debit: 4000000 },
        { type: "purchase", credit: 2500000, debit: 0 },
        { type: "payment", credit: 0, debit: 3000000 },
      ];

      let running = opening;
      let totalPurchases = 0;
      let totalReturns = 0;
      let totalPayments = 0;

      for (const tx of transactions) {
        running += tx.credit - tx.debit;
        if (tx.type === "purchase") totalPurchases += tx.credit;
        if (tx.type === "purchase_return") totalReturns += tx.debit;
        if (tx.type === "payment") totalPayments += tx.debit;
      }

      expect(totalPurchases).toBe(7500000); // ₹75,000
      expect(totalReturns).toBe(500000);   // ₹5,000
      expect(totalPayments).toBe(7000000);  // ₹70,000
      expect(running).toBe(1000000);        // Closing = ₹10,000

      // Invariant: closing === opening + purchases - returns - payments
      expect(running).toBe(opening + totalPurchases - totalReturns - totalPayments);
    });
  });
});

