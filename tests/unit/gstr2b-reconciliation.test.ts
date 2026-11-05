import { describe, it, expect } from "vitest";
import { parseGstr2bJson } from "@/server/domain/gst-reconciliation/parser";
import {
  reconcileGstr2bWithBooks,
  normalizeInvoiceNo,
  dateDiffDays,
  BookPurchaseCandidate,
} from "@/server/domain/gst-reconciliation/match-engine";
import {
  generateImsBulkActionCsv,
  formatIndianGstDate,
  formatRupees,
} from "@/server/domain/gst-reconciliation/ims-actions";

describe("GSTR-2B JSON Parser", () => {
  it("parses standard nested GSTN portal export format with B2B and CDNR", () => {
    const portalJson = JSON.stringify({
      gstin: "27AABCS1429B1Z1",
      fp: "082026",
      data: {
        docdata: {
          b2b: [
            {
              ctin: "27AAACW1234A1Z5",
              trdnm: "Cipla Healthcare Ltd",
              inv: [
                {
                  inum: "INV-2026-0091",
                  idt: "15-08-2026",
                  val: 12500.5,
                  inv_typ: "R",
                  itcavl: "Y",
                  items: [
                    {
                      num: 1,
                      txval: 10000.0,
                      rt: 18,
                      camt: 900.0,
                      samt: 900.0,
                      csamt: 700.5,
                    },
                  ],
                },
              ],
            },
          ],
          cdnr: [
            {
              ctin: "27AAACW1234A1Z5",
              trdnm: "Cipla Healthcare Ltd",
              nt: [
                {
                  nt_num: "CR-101",
                  nt_dt: "20-08-2026",
                  val: 1180.0,
                  typ: "C",
                  items: [
                    {
                      num: 1,
                      txval: 1000.0,
                      rt: 18,
                      camt: 90.0,
                      samt: 90.0,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });

    const parsed = parseGstr2bJson(portalJson);
    expect(parsed.gstin).toBe("27AABCS1429B1Z1");
    expect(parsed.returnPeriod).toBe("2026-08");
    expect(parsed.financialYear).toBe("2026-2027");
    expect(parsed.lines).toHaveLength(2);

    const b2b = parsed.lines[0];
    expect(b2b.supplierGstin).toBe("27AAACW1234A1Z5");
    expect(b2b.supplierName).toBe("Cipla Healthcare Ltd");
    expect(b2b.invoiceNo).toBe("INV-2026-0091");
    expect(b2b.invoiceDate).toBe("2026-08-15");
    expect(b2b.taxableAmountPaise).toBe(1000000); // 10000.00 * 100
    expect(b2b.cgstPaise).toBe(90000); // 900.00 * 100
    expect(b2b.sgstPaise).toBe(90000);
    expect(b2b.cessPaise).toBe(70050); // 700.50 * 100
    expect(b2b.totalAmountPaise).toBe(1250050);
    expect(b2b.docType).toBe("invoice");

    const cdnr = parsed.lines[1];
    expect(cdnr.invoiceNo).toBe("CR-101");
    expect(cdnr.docType).toBe("credit_note");
    expect(cdnr.taxableAmountPaise).toBe(100000);
  });

  it("handles flat JSON format and malformed date fallbacks", () => {
    const flatJson = JSON.stringify({
      gstin: "27AABCS1429B1Z1",
      fp: "2026-09",
      b2b: [
        {
          ctin: "27BBBPS5678C1Z2",
          trdnm: "Sun Pharma Distributors",
          inv: [
            {
              inum: "SP/8892",
              idt: "2026-09-10",
              val: 5000,
              items: [{ num: 1, txval: 5000, rt: 0, camt: 0, samt: 0 }],
            },
          ],
        },
      ],
    });

    const parsed = parseGstr2bJson(flatJson);
    expect(parsed.returnPeriod).toBe("2026-09");
    expect(parsed.lines[0].invoiceDate).toBe("2026-09-10");
    expect(parsed.lines[0].totalAmountPaise).toBe(500000);
  });
});

describe("GSTR-2B Match Engine & Tolerance Rules", () => {
  it("correctly normalizes invoice numbers across formats", () => {
    expect(normalizeInvoiceNo("INV/2026/00142")).toBe("INV2026142");
    expect(normalizeInvoiceNo("inv-2026-142")).toBe("INV2026142");
    expect(normalizeInvoiceNo("  INV 2026 0142 ")).toBe("INV2026142");
  });

  it("calculates exact calendar day differences", () => {
    expect(dateDiffDays("2026-08-10", "2026-08-12")).toBe(2);
    expect(dateDiffDays("2026-08-15", "2026-08-15")).toBe(0);
    expect(dateDiffDays("2026-08-20", "2026-08-15")).toBe(5);
  });

  it("reconciles Tier 1 exact matches with 0 variance and auto-accepts", () => {
    const parsedLines = [
      {
        supplierGstin: "27AAACW1234A1Z5",
        supplierName: "Cipla Ltd",
        docType: "invoice" as const,
        invoiceNo: "INV-001",
        invoiceDate: "2026-08-10",
        taxableAmountPaise: 100000,
        cgstPaise: 6000,
        sgstPaise: 6000,
        igstPaise: 0,
        cessPaise: 0,
        totalAmountPaise: 112000,
        itcAvailability: "Y" as const,
      },
    ];

    const bookPurchases: BookPurchaseCandidate[] = [
      {
        id: "purch-1",
        purchaseNo: "PO-2026-01",
        supplierInvoiceNo: "INV-001",
        supplierGstin: "27AAACW1234A1Z5",
        supplierName: "Cipla Ltd",
        invoiceDate: "2026-08-10",
        taxableAmount: 100000,
        cgst: 6000,
        sgst: 6000,
        igst: 0,
        totalAmount: 112000,
      },
    ];

    const result = reconcileGstr2bWithBooks(parsedLines, bookPurchases);
    expect(result.summary.exactMatches).toBe(1);
    expect(result.summary.toleranceMatches).toBe(0);
    expect(result.summary.mismatches).toBe(0);
    expect(result.summary.missingInBooks).toBe(0);
    expect(result.summary.missingIn2b).toBe(0);

    const line = result.lines[0];
    expect(line.matchStatus).toBe("exact_match");
    expect(line.matchVarianceAmount).toBe(0);
    expect(line.imsAction).toBe("accept");
    expect(line.matchedPurchaseId).toBe("purch-1");
  });

  it("reconciles Tier 2 tolerance matches within ₹2.00 variance and ±3 days", () => {
    const parsedLines = [
      {
        supplierGstin: "27AAACW1234A1Z5",
        supplierName: "Cipla Ltd",
        docType: "invoice" as const,
        invoiceNo: "INV/2026/00142",
        invoiceDate: "2026-08-12",
        taxableAmountPaise: 500000,
        cgstPaise: 30000,
        sgstPaise: 30000,
        igstPaise: 0,
        cessPaise: 0,
        totalAmountPaise: 560150, // ₹5,601.50
        itcAvailability: "Y" as const,
      },
    ];

    const bookPurchases: BookPurchaseCandidate[] = [
      {
        id: "purch-2",
        purchaseNo: "PO-2026-02",
        supplierInvoiceNo: "INV-2026-142", // normalized match
        supplierGstin: "27AAACW1234A1Z5",
        supplierName: "Cipla Ltd",
        invoiceDate: "2026-08-10", // 2 days diff (<= 3 days)
        taxableAmount: 500000,
        cgst: 30000,
        sgst: 30000,
        igst: 0,
        totalAmount: 560000, // ₹5,600.00 (variance: 150 paise <= 200 paise)
      },
    ];

    const result = reconcileGstr2bWithBooks(parsedLines, bookPurchases);
    expect(result.summary.toleranceMatches).toBe(1);
    expect(result.lines[0].matchStatus).toBe("tolerance_match");
    expect(result.lines[0].matchVarianceAmount).toBe(150);
    expect(result.lines[0].imsAction).toBe("accept");
  });

  it("flags Tier 3 mismatches when variance exceeds ₹2.00 statutory rounding threshold", () => {
    const parsedLines = [
      {
        supplierGstin: "27AAACW1234A1Z5",
        supplierName: "Cipla Ltd",
        docType: "invoice" as const,
        invoiceNo: "INV-999",
        invoiceDate: "2026-08-10",
        taxableAmountPaise: 1000000,
        cgstPaise: 90000,
        sgstPaise: 90000,
        igstPaise: 0,
        cessPaise: 0,
        totalAmountPaise: 1180000, // ₹11,800
        itcAvailability: "Y" as const,
      },
    ];

    const bookPurchases: BookPurchaseCandidate[] = [
      {
        id: "purch-3",
        purchaseNo: "PO-2026-03",
        supplierInvoiceNo: "INV-999",
        supplierGstin: "27AAACW1234A1Z5",
        supplierName: "Cipla Ltd",
        invoiceDate: "2026-08-10",
        taxableAmount: 900000,
        cgst: 81000,
        sgst: 81000,
        igst: 0,
        totalAmount: 1062000, // ₹10,620 (variance: ₹1,180 > ₹2.00)
      },
    ];

    const result = reconcileGstr2bWithBooks(parsedLines, bookPurchases);
    expect(result.summary.mismatches).toBe(1);
    expect(result.lines[0].matchStatus).toBe("mismatch");
    expect(result.lines[0].imsAction).toBe("pending");
    expect(result.lines[0].matchVarianceAmount).toBe(118000);
  });

  it("flags Tier 4 missing in books and missing in 2B", () => {
    const parsedLines = [
      {
        supplierGstin: "27ZZZZ1111A1Z9",
        supplierName: "Unknown Supplier Ltd",
        docType: "invoice" as const,
        invoiceNo: "NEW-INV-1",
        invoiceDate: "2026-08-14",
        taxableAmountPaise: 200000,
        cgstPaise: 18000,
        sgstPaise: 18000,
        igstPaise: 0,
        cessPaise: 0,
        totalAmountPaise: 236000,
        itcAvailability: "Y" as const,
      },
    ];

    const bookPurchases: BookPurchaseCandidate[] = [
      {
        id: "purch-unreported",
        purchaseNo: "PO-2026-04",
        supplierInvoiceNo: "UNREPORTED-99",
        supplierGstin: "27XXXX2222A1Z1",
        supplierName: "Local Distributor",
        invoiceDate: "2026-08-01",
        taxableAmount: 150000,
        cgst: 9000,
        sgst: 9000,
        igst: 0,
        totalAmount: 168000,
      },
    ];

    const result = reconcileGstr2bWithBooks(parsedLines, bookPurchases);
    expect(result.summary.missingInBooks).toBe(1);
    expect(result.summary.missingIn2b).toBe(1);
    expect(result.lines[0].matchStatus).toBe("missing_in_books");
    expect(result.lines[0].matchedPurchaseId).toBeNull();
    expect(result.missingIn2bPurchases[0].id).toBe("purch-unreported");
  });
});

describe("IMS Bulk Action CSV Exporter", () => {
  it("formats Indian GST dates and 2-decimal rupee strings", () => {
    expect(formatIndianGstDate("2026-08-15")).toBe("15-08-2026");
    expect(formatRupees(150050)).toBe("1500.50");
    expect(formatRupees(200)).toBe("2.00");
  });

  it("generates GSTN portal-ready CSV with all statutory headers", () => {
    const csv = generateImsBulkActionCsv([
      {
        supplierGstin: "27AAACW1234A1Z5",
        supplierName: "Cipla Ltd",
        docType: "B2B",
        invoiceNo: "INV-001",
        invoiceDate: "2026-08-10",
        taxableAmountPaise: 100000,
        igstPaise: 0,
        cgstPaise: 6000,
        sgstPaise: 6000,
        cessPaise: 0,
        totalAmountPaise: 112000,
        imsAction: "accept",
        remarks: "Auto-matched",
      },
      {
        supplierGstin: "27ZZZZ1111A1Z9",
        supplierName: "Mismatched Co",
        docType: "B2B",
        invoiceNo: "INV-002",
        invoiceDate: "2026-08-12",
        taxableAmountPaise: 200000,
        igstPaise: 36000,
        cgstPaise: 0,
        sgstPaise: 0,
        cessPaise: 0,
        totalAmountPaise: 236000,
        imsAction: "reject",
        remarks: "Supplier error",
      },
    ]);

    expect(csv).toContain("GSTIN of Supplier,Trade / Legal Name,Document Type");
    expect(csv).toContain('"27AAACW1234A1Z5","Cipla Ltd","B2B","INV-001","10-08-2026","1000.00"');
    expect(csv).toContain('"Accept"');
    expect(csv).toContain('"Reject"');
  });
});
