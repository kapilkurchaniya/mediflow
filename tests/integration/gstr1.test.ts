 import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGstr1JsonPayload, type Gstr1Summary } from "@/server/domain/gst";

describe("GSTR-1 JSON Payload Integration & Portal Schema Conformance (B1.3)", () => {
  const fixturePath = join(__dirname, "../fixtures/gstr1-expected.json");
  const expectedFixture = JSON.parse(readFileSync(fixturePath, "utf-8"));

  const testSummary: Gstr1Summary = {
    period: { month: 10, year: 2026, fromDate: "2026-10-01", toDate: "2026-10-31" },
    b2b: [
      {
        id: "doc-1",
        docNo: "INV-2026-0001",
        docDate: "2026-10-15",
        partyName: "Apollo Meds",
        partyGstin: "27GSPTE0985F1Z5",
        placeOfSupply: "27-Maharashtra",
        taxableAmount: 100000,
        cgst: 2500,
        sgst: 2500,
        igst: 0,
        total: 105000,
        irn: "abc123irn",
        status: "active",
      },
    ],
    b2cl: [
      {
        id: "doc-2",
        docNo: "INV-2026-0002",
        docDate: "2026-10-16",
        placeOfSupply: "24-Gujarat",
        taxableAmount: 30000000,
        igst: 1500000,
        total: 31500000,
      },
    ],
    b2cs: [
      {
        placeOfSupply: "27-Maharashtra",
        taxRateBp: 500,
        taxableAmount: 50000,
        cgst: 1250,
        sgst: 1250,
        igst: 0,
        total: 52500,
      },
    ],
    cdnr: [],
    hsnSummary: [
      {
        hsn: "30049099",
        description: "Pharmaceutical formulations",
        uqc: "NOS",
        totalQty: 10,
        totalValue: 105000,
        taxableAmount: 100000,
        cgst: 2500,
        sgst: 2500,
        igst: 0,
      },
    ],
    docSummary: {
      totalIssued: 3,
      cancelled: 0,
      netIssued: 3,
      fromDocNo: "INV-2026-0001",
      toDocNo: "INV-2026-0003",
    },
    totals: {
      taxable: 30150000,
      cgst: 3750,
      sgst: 3750,
      igst: 1500000,
      cess: 0,
      totalTax: 1507500,
      grossTotal: 31657500,
      b2bCount: 1,
      b2cCount: 2,
    },
  };

  it("produces an exact match to the government GSTR-1 expected fixture", () => {
    const payload = buildGstr1JsonPayload(testSummary, "27AAPCS1234F1ZD");
    expect(payload).toEqual(expectedFixture);
  });

  it("contains all 6 mandatory GST portal root tables", () => {
    const payload = buildGstr1JsonPayload(testSummary, "27AAPCS1234F1ZD");

    expect(payload).toHaveProperty("gstin", "27AAPCS1234F1ZD");
    expect(payload).toHaveProperty("fp", "102026");
    expect(payload).toHaveProperty("gt");
    expect(payload).toHaveProperty("cur_gt");

    // Root tables per GST portal schema
    expect(payload).toHaveProperty("b2b");
    expect(payload).toHaveProperty("b2cl");
    expect(payload).toHaveProperty("b2cs");
    expect(payload).toHaveProperty("cdnr");
    expect(payload).toHaveProperty("hsn");
    expect(payload).toHaveProperty("doc_issue");
  });

  it("converts paise amounts to 2-decimal rupee precision in invoice and tax lines", () => {
    const payload = buildGstr1JsonPayload(testSummary, "27AAPCS1234F1ZD");

    // ₹3,16,575.00
    expect(payload.gt).toBe(316575);

    // B2B: ₹1,000 taxable + ₹25 CGST + ₹25 SGST = ₹1,050 total
    const b2bInv = payload.b2b[0].inv[0];
    expect(b2bInv.val).toBe(1050);
    expect(b2bInv.itms[0].itm_det.txval).toBe(1000);
    expect(b2bInv.itms[0].itm_det.camt).toBe(25);
    expect(b2bInv.itms[0].itm_det.samt).toBe(25);
    expect(b2bInv.itms[0].itm_det.iamt).toBe(0);

    // B2CL: ₹3,00,000 taxable + ₹15,000 IGST = ₹3,15,000 total
    const b2clInv = payload.b2cl[0].inv[0];
    expect(b2clInv.val).toBe(315000);
    expect(b2clInv.itms[0].itm_det.txval).toBe(300000);
    expect(b2clInv.itms[0].itm_det.iamt).toBe(15000);

    // B2CS: ₹500 taxable + ₹12.50 CGST + ₹12.50 SGST
    const b2csItem = payload.b2cs[0];
    expect(b2csItem.txval).toBe(500);
    expect(b2csItem.camt).toBe(12.5);
    expect(b2csItem.samt).toBe(12.5);
    expect(b2csItem.sply_ty).toBe("INTRA");

    // HSN: pharmaceutical formulation 30049099
    const hsnItem = payload.hsn.data[0];
    expect(hsnItem.hsn_sc).toBe("30049099");
    expect(hsnItem.txval).toBe(1000);
    expect(hsnItem.val).toBe(1050);
    expect(hsnItem.qty).toBe(10);
  });

  it("formats dates in strict DD-MM-YYYY format for GST offline tool", () => {
    const payload = buildGstr1JsonPayload(testSummary, "27AAPCS1234F1ZD");

    expect(payload.b2b[0].inv[0].idt).toBe("15-10-2026");
    expect(payload.b2cl[0].inv[0].idt).toBe("16-10-2026");
  });

  it("extracts 2-digit state codes for place of supply (pos)", () => {
    const payload = buildGstr1JsonPayload(testSummary, "27AAPCS1234F1ZD");

    expect(payload.b2b[0].inv[0].pos).toBe("27");
    expect(payload.b2cl[0].pos).toBe("24");
    expect(payload.b2cs[0].pos).toBe("27");
  });

  it("formats CDNR credit notes linked to original invoice when present (B2.6)", () => {
    const summaryWithCdnr: Gstr1Summary = {
      ...testSummary,
      cdnr: [
        {
          id: "cn-1",
          docNo: "CN-2026-0001",
          docDate: "2026-10-20",
          originalInvoiceNo: "INV-2026-0001",
          originalInvoiceDate: "2026-10-15",
          partyName: "Apollo Meds",
          partyGstin: "27GSPTE0985F1Z5",
          placeOfSupply: "27-Maharashtra",
          noteType: "C",
          taxableAmount: 50000,
          cgst: 1250,
          sgst: 1250,
          igst: 0,
          total: 52500,
          status: "active",
        },
      ],
    };

    const payload = buildGstr1JsonPayload(summaryWithCdnr, "27AAPCS1234F1ZD");
    expect(payload.cdnr).toHaveLength(1);
    expect(payload.cdnr[0].ctin).toBe("27GSPTE0985F1Z5");

    const note = payload.cdnr[0].nt[0];
    expect(note.ntty).toBe("C");
    expect(note.nt_num).toBe("CN-2026-0001");
    expect(note.nt_dt).toBe("20-10-2026");
    expect(note.inum).toBe("INV-2026-0001");
    expect(note.idt).toBe("15-10-2026");
    expect(note.val).toBe(525);
    expect(note.pos).toBe("27");
    expect(note.itms[0].itm_det.txval).toBe(500);
    expect(note.itms[0].itm_det.camt).toBe(12.5);
    expect(note.itms[0].itm_det.samt).toBe(12.5);
  });

  it("reports cancelled documents correctly in doc_issue summary (B2.6)", () => {
    const summaryWithCancelled: Gstr1Summary = {
      ...testSummary,
      docSummary: {
        totalIssued: 10,
        cancelled: 2,
        netIssued: 8,
        fromDocNo: "INV-001",
        toDocNo: "INV-010",
      },
    };

    const payload = buildGstr1JsonPayload(summaryWithCancelled, "27AAPCS1234F1ZD");
    const docDet = payload.doc_issue.doc_det[0].docs[0];
    expect(docDet.totnum).toBe(10);
    expect(docDet.canc).toBe(2);
    expect(docDet.net_issue).toBe(8);
  });
});
