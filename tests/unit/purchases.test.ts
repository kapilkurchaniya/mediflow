 import { describe, expect, it } from "vitest";
import { computePurchaseLine, computePurchaseTotals } from "@/lib/money";
import { GST_RATES_BP, isValidGstRateBp } from "@/lib/regulatory";
import { CreatePurchaseSchema, PurchaseItemInputSchema } from "@/server/domain/purchases";

describe("Purchase Hardening Arithmetic & Landed Cost (B1.7 / B-2.0 / B-2.0a)", () => {
  it("calculates landed unit cost spreading taxable over (qty + freeQty)", () => {
    // 10 units + 1 free unit at rate ₹60 (6000 paise)
    // Gross: 10 * 6000 = 60000 paise
    // Free: 1 unit, Total units: 11
    // Landed unit cost: 60000 / 11 = 5454.54 -> rounded to 5455 paise (₹54.55)
    const line = computePurchaseLine({
      qty: 10,
      freeQty: 1,
      rate: 6000,
      discountBp: 0,
      gstRateBp: 500,
    });

    expect(line.gross).toBe(60000);
    expect(line.discount).toBe(0);
    expect(line.taxable).toBe(60000);
    expect(line.landedUnitCost).toBe(5455);
    expect(line.cgst).toBe(1500); // 5% of 60000 = 3000 -> cgst 1500, sgst 1500
    expect(line.sgst).toBe(1500);
    expect(line.igst).toBe(0);
    expect(line.total).toBe(63000);
  });

  it("calculates landed unit cost for 100 + 10 free units as per B-2.0 spec", () => {
    // 100 units + 10 free at ₹60 (6000 paise) excl GST
    // Gross: 600,000 paise
    // Units received: 110
    // Landed cost: 600,000 / 110 = 5,455 paise
    const line = computePurchaseLine({
      qty: 100,
      freeQty: 10,
      rate: 6000,
      discountBp: 0,
      gstRateBp: 500,
    });

    expect(line.taxable).toBe(600000);
    expect(line.landedUnitCost).toBe(5455);
    expect(line.tax).toBe(30000); // 5% = 30000 paise (₹300)
    expect(line.cgst).toBe(15000); // ₹150
    expect(line.sgst).toBe(15000); // ₹150
    expect(line.total).toBe(630000);
  });

  it("calculates landed unit cost with discount applied before spreading", () => {
    // 10 units + 2 free at rate ₹100 (10000 paise), 10% discount (1000 bp)
    // Gross: 10 * 10000 = 100000 paise
    // Discount: 10% = 10000 paise
    // Taxable: 90000 paise
    // Total units: 10 + 2 = 12
    // Landed unit cost: 90000 / 12 = 7500 paise (₹75.00)
    const line = computePurchaseLine({
      qty: 10,
      freeQty: 2,
      rate: 10000,
      discountBp: 1000,
      gstRateBp: 1800,
    });

    expect(line.gross).toBe(100000);
    expect(line.discount).toBe(10000);
    expect(line.taxable).toBe(90000);
    expect(line.landedUnitCost).toBe(7500);
    expect(line.tax).toBe(16200); // 18% of 90000
  });

  it("handles zero free quantity with landed unit cost equal to net rate", () => {
    const line = computePurchaseLine({
      qty: 5,
      freeQty: 0,
      rate: 4000,
      discountBp: 0,
      gstRateBp: 500,
    });

    expect(line.landedUnitCost).toBe(4000);
  });

  it("splits GST into IGST for inter-state purchases", () => {
    const totals = computePurchaseTotals(
      [
        {
          qty: 10,
          freeQty: 0,
          rate: 10000,
          discountBp: 0,
          gstRateBp: 1800,
        },
      ],
      true // inter-state
    );

    expect(totals.taxable).toBe(100000);
    expect(totals.cgst).toBe(0);
    expect(totals.sgst).toBe(0);
    expect(totals.igst).toBe(18000);
    expect(totals.total).toBe(118000);
  });

  it("splits GST into CGST and SGST for intra-state purchases", () => {
    const totals = computePurchaseTotals(
      [
        {
          qty: 10,
          freeQty: 0,
          rate: 10000,
          discountBp: 0,
          gstRateBp: 1800,
        },
      ],
      false // intra-state
    );

    expect(totals.taxable).toBe(100000);
    expect(totals.cgst).toBe(9000);
    expect(totals.sgst).toBe(9000);
    expect(totals.igst).toBe(0);
    expect(totals.total).toBe(118000);
  });
});

describe("Purchase Input Schema & Validation (B1.7)", () => {
  it("rejects non-positive quantities", () => {
    const res = PurchaseItemInputSchema.safeParse({
      medicineId: "med-1",
      batchNo: "B001",
      expiryDate: "2027-12-31",
      qty: 0,
      freeQty: 0,
      rate: 1000,
      mrp: 1500,
      saleRate: 1500,
      discountBp: 0,
      gstRateBp: 500,
    });
    expect(res.success).toBe(false);

    const negativeRes = PurchaseItemInputSchema.safeParse({
      medicineId: "med-1",
      batchNo: "B001",
      expiryDate: "2027-12-31",
      qty: -5,
      freeQty: 0,
      rate: 1000,
      mrp: 1500,
      saleRate: 1500,
      discountBp: 0,
      gstRateBp: 500,
    });
    expect(negativeRes.success).toBe(false);
  });

  it("rejects negative free quantity", () => {
    const res = PurchaseItemInputSchema.safeParse({
      medicineId: "med-1",
      batchNo: "B001",
      expiryDate: "2027-12-31",
      qty: 10,
      freeQty: -1,
      rate: 1000,
      mrp: 1500,
      saleRate: 1500,
      discountBp: 0,
      gstRateBp: 500,
    });
    expect(res.success).toBe(false);
  });

  it("rejects negative rate", () => {
    const res = PurchaseItemInputSchema.safeParse({
      medicineId: "med-1",
      batchNo: "B001",
      expiryDate: "2027-12-31",
      qty: 10,
      freeQty: 0,
      rate: -100,
      mrp: 1500,
      saleRate: 1500,
      discountBp: 0,
      gstRateBp: 500,
    });
    expect(res.success).toBe(false);
  });

  it("rejects discount exceeding 100%", () => {
    const res = PurchaseItemInputSchema.safeParse({
      medicineId: "med-1",
      batchNo: "B001",
      expiryDate: "2027-12-31",
      qty: 10,
      freeQty: 0,
      rate: 1000,
      mrp: 1500,
      saleRate: 1500,
      discountBp: 10001,
      gstRateBp: 500,
    });
    expect(res.success).toBe(false);
  });

  it("rejects GST rates outside GST_RATES_BP", () => {
    // 700 bp (7%) is not a valid Indian GST rate
    const res = PurchaseItemInputSchema.safeParse({
      medicineId: "med-1",
      batchNo: "B001",
      expiryDate: "2027-12-31",
      qty: 10,
      freeQty: 0,
      rate: 1000,
      mrp: 1500,
      saleRate: 1500,
      discountBp: 0,
      gstRateBp: 700,
    });
    expect(res.success).toBe(false);

    // Valid GST rates pass: 0, 500, 1200, 1800, 2800
    for (const validRate of GST_RATES_BP) {
      expect(isValidGstRateBp(validRate)).toBe(true);
      const validRes = PurchaseItemInputSchema.safeParse({
        medicineId: "med-1",
        batchNo: "B001",
        expiryDate: "2027-12-31",
        qty: 10,
        freeQty: 0,
        rate: 1000,
        mrp: 1500,
        saleRate: 1500,
        discountBp: 0,
        gstRateBp: validRate,
      });
      expect(validRes.success).toBe(true);
    }
  });

  it("rejects purchase without items", () => {
    const res = CreatePurchaseSchema.safeParse({
      supplierId: "sup-1",
      supplierInvoiceNo: "INV-001",
      invoiceDate: "2026-10-21",
      items: [],
    });
    expect(res.success).toBe(false);
  });

  it("ignores any client-passed amounts (tampering resilience)", () => {
    // Client tries to inject fake taxableAmount and totalAmount = 1
    const rawInput = {
      medicineId: "med-1",
      batchNo: "B001",
      expiryDate: "2027-12-31",
      qty: 100,
      freeQty: 10,
      rate: 6000, // ₹60
      mrp: 10000,
      saleRate: 10000,
      discountBp: 0,
      gstRateBp: 500,
      taxableAmount: 1, // TAMPERED
      totalAmount: 1, // TAMPERED
      discountAmount: 999999, // TAMPERED
    };

    const parsed = PurchaseItemInputSchema.parse(rawInput);
    // Schema strips or ignores extra fields
    const parsedRecord = parsed as Record<string, unknown>;
    expect(parsedRecord.taxableAmount).toBeUndefined();
    expect(parsedRecord.totalAmount).toBeUndefined();

    // Recomputed totals are based ONLY on verified fields
    const computed = computePurchaseLine(parsed);
    expect(computed.taxable).toBe(600000);
    expect(computed.total).toBe(630000);
    expect(computed.landedUnitCost).toBe(5455);
  });

  describe("Pharma Purchase Scheme Engine (Task B2.8)", () => {
    it("computes 10+1 free goods scheme with Trade Discount 10% and Cash Discount 2%", () => {
      // 10 billed packs + 1 free pack at ₹100 (10000 paise) per pack
      // Units per pack: 10 tablets/pack -> 110 total tablets received
      // Gross: 10 * 10000 = 100000 paise
      // Trade Discount (10%): 10000 paise
      // Taxable: 90000 paise
      // GST (12%): 10800 paise
      // Cash Discount (2% on taxable): 1800 paise
      // Net Total Payable: 90000 + 10800 - 1800 = 99000 paise (₹990.00)
      // Net Cost after cash discount: 90000 - 1800 = 88200 paise
      // Landed Pack Cost: 88200 / 11 = 8018 paise (₹80.18/pack)
      // Landed Base Unit Cost: 88200 / 110 = 802 paise (₹8.02/tablet)
      const line = computePurchaseLine({
        qty: 10,
        freeQty: 1,
        rate: 10000,
        tradeDiscountBp: 1000,
        cashDiscountBp: 200,
        unitsPerPack: 10,
        gstRateBp: 1200,
      });

      expect(line.gross).toBe(100000);
      expect(line.tradeDiscount).toBe(10000);
      expect(line.taxable).toBe(90000);
      expect(line.cgst).toBe(5400);
      expect(line.sgst).toBe(5400);
      expect(line.tax).toBe(10800);
      expect(line.cashDiscount).toBe(1800);
      expect(line.total).toBe(99000);
      expect(line.totalPacks).toBe(11);
      expect(line.totalBaseUnits).toBe(110);
      expect(line.landedPackCost).toBe(8018);
      expect(line.landedUnitCost).toBe(802);
    });

    it("aggregates purchase totals with TD and CD across multiple scheme lines", () => {
      const totals = computePurchaseTotals([
        {
          qty: 10,
          freeQty: 1,
          rate: 10000,
          tradeDiscountBp: 1000, // 10% TD
          cashDiscountBp: 200, // 2% CD
          unitsPerPack: 10,
          gstRateBp: 1200,
        },
        {
          qty: 20,
          freeQty: 2, // 20+2 scheme
          rate: 5000, // ₹50/pack
          tradeDiscountBp: 500, // 5% TD
          cashDiscountBp: 100, // 1% CD
          unitsPerPack: 15,
          gstRateBp: 500,
        },
      ]);

      // Line 1:
      // Gross: 100,000, TD: 10,000, Taxable: 90,000, Tax: 10,800, CD: 1,800, Total: 99,000
      // Line 2:
      // Gross: 20 * 5000 = 100,000, TD: 5000, Taxable: 95,000, Tax (5%): 4,750, CD: 950, Total: 98,800
      // Aggregate:
      // Gross: 200,000, TradeDiscount: 15,000, Taxable: 185,000, Tax: 15,550, CashDiscount: 2,750
      // Net Total: 185,000 + 15,550 - 2,750 = 197,800
      expect(totals.gross).toBe(200000);
      expect(totals.tradeDiscount).toBe(15000);
      expect(totals.taxable).toBe(185000);
      expect(totals.tax).toBe(15550);
      expect(totals.cashDiscount).toBe(2750);
      expect(totals.total).toBe(197800);
    });

    it("falls back to discountBp when tradeDiscountBp is not explicitly passed", () => {
      const line = computePurchaseLine({
        qty: 5,
        freeQty: 0,
        rate: 8000,
        discountBp: 1500, // 15% legacy discount
        gstRateBp: 1800,
      });

      expect(line.tradeDiscount).toBe(6000); // 15% of 40000
      expect(line.taxable).toBe(34000);
      expect(line.cashDiscount).toBe(0);
      expect(line.total).toBe(40120); // 34000 + 18% (6120)
    });
  });
});
