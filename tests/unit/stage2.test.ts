import { describe, expect, it } from "vitest";
import { parsePackBarcode } from "@/lib/barcode/gs1-parser";
import { generateTsplLabel, generateZplLabel } from "@/lib/barcode/label-printer";
import { getBillLabels } from "@/lib/i18n/bill-labels";
import { computeCompositionTax, computeTdsDeduction } from "@/lib/tax/composition-and-tds";
import { summarizeImsInvoices } from "@/server/domain/gst-ims";
import { buildBusinessAnalysisPivot } from "@/server/domain/reports/business-analysis";
import { encryptOfflinePayload, decryptOfflinePayload } from "@/lib/offline/crypto-store";

describe("Stage 2: GS1/H2 QR, Labels, Regional Print, Crypto, Composition/TDS, IMS & Pivot", () => {
  it("parses GS1 and Schedule H2 QR pack barcodes", () => {
    const gs1 = parsePackBarcode("(01)08901234567890(17)271231(10)B991(21)S12345");
    expect(gs1.format).toBe("gs1");
    expect(gs1.gtin).toBe("08901234567890");
    expect(gs1.batchNo).toBe("B991");
    expect(gs1.expiryDate).toBe("2027-12-31");
    expect(gs1.serialNo).toBe("S12345");

    const h2 = parsePackBarcode('{"gtin":"08901234567890","batch":"H2B1","expiry":"2028-06-30"}');
    expect(h2.format).toBe("h2_qr");
    expect(h2.batchNo).toBe("H2B1");
    expect(h2.expiryDate).toBe("2028-06-30");
  });

  it("generates TSPL and ZPL barcode/MRP labels", () => {
    const tspl = generateTsplLabel({
      storeName: "Apollo Med",
      medicineName: "Dolo 650",
      batchNo: "B123",
      expiryDate: "2027-10-31",
      mrpPaise: 3250,
      barcode: "8901234567890",
      copies: 2,
    });
    expect(tspl).toContain('MRP Rs.32.50');
    expect(tspl).toContain("PRINT 1,2");

    const zpl = generateZplLabel({
      storeName: "Apollo Med",
      medicineName: "Dolo 650",
      batchNo: "B123",
      expiryDate: "2027-10-31",
      mrpPaise: 3250,
      barcode: "8901234567890",
    });
    expect(zpl).toContain("^XA");
    expect(zpl).toContain("^XZ");
  });

  it("returns regional bill labels for Hindi, Marathi, Gujarati, Tamil, Bengali", () => {
    expect(getBillLabels("hi").taxInvoice).toContain("टैक्स");
    expect(getBillLabels("ta").total).toBe("மொத்தம்");
    expect(getBillLabels("en").taxInvoice).toBe("TAX INVOICE");
  });

  it("encrypts and decrypts offline payload with AES-256-GCM", async () => {
    const secret = "store-pin-9911";
    const cipher = await encryptOfflinePayload('{"saleId":"s1"}', secret);
    const plain = await decryptOfflinePayload(cipher, secret);
    expect(plain).toBe('{"saleId":"s1"}');
  });

  it("computes Composition 1% GST and TDS 194Q/194H deductions", () => {
    const comp = computeCompositionTax(100000); // ₹1,000.00
    expect(comp.totalTaxPaise).toBe(1000); // ₹10.00 (1%)
    expect(comp.cgstPaise).toBe(500);
    expect(comp.sgstPaise).toBe(500);
    expect(comp.itcEligible).toBe(false);

    const tds194q = computeTdsDeduction({ section: "194Q", baseAmountPaise: 1000000, hasPan: true });
    expect(tds194q.tdsAmountPaise).toBe(1000); // 0.1%
    expect(tds194q.netPayablePaise).toBe(999000);
  });

  it("summarizes IMS/GSTR-2B eligible vs blocked ITC and builds Business Analysis pivot", () => {
    const ims = summarizeImsInvoices([
      {
        id: "1",
        supplierGstin: "27ABCDE1234F1Z5",
        supplierName: "Cipla Dist",
        invoiceNo: "INV-1",
        invoiceDate: "2026-11-01",
        taxablePaise: 10000,
        taxPaise: 1200,
        totalPaise: 11200,
        imsStatus: "accepted",
      },
      {
        id: "2",
        supplierGstin: "27ABCDE1234F1Z5",
        supplierName: "Cipla Dist",
        invoiceNo: "INV-2",
        invoiceDate: "2026-11-02",
        taxablePaise: 10000,
        taxPaise: 1200,
        totalPaise: 11200,
        imsStatus: "pending",
      },
    ]);
    expect(ims.eligibleItcPaise).toBe(1200);
    expect(ims.blockedItcPaise).toBe(1200);

    const pivot = buildBusinessAnalysisPivot(
      [
        {
          medicineName: "Dolo 650",
          categoryName: "Analgesics",
          manufacturerName: "Micro Labs",
          qty: 10,
          totalAmount: 30000,
          unitCost: 2000,
        },
      ],
      "manufacturer",
    );
    expect(pivot[0]).toMatchObject({
      label: "Micro Labs",
      unitsSold: 10,
      grossSalesPaise: 30000,
      cogsPaise: 20000,
      grossMarginPaise: 10000,
    });
  });
});
