import { describe, it, expect } from "vitest";
import { buildEscPDotMatrixInvoice, ESCP_COMMANDS, EscPBuilder } from "@/desktop/escp";
import type { SalePrintData } from "@/desktop/types";

describe("Epson ESC/P Dot-Matrix Formatter", () => {
  const sampleSale: SalePrintData = {
    storeName: "Apollo Meds Wholesale",
    storeAddress: "Sector 18, Vashi, Navi Mumbai",
    storePhone: "022-27891234",
    storeGstin: "27AABCA1234F1Z9",
    storeDlNumbers: ["20B/987", "21B/654"],
    invoiceNo: "AP01-2627-000102",
    completedAt: "2026-11-04T12:30:00.000Z",
    cashierName: "Pharmacist Roy",
    patientName: "Bob Patel",
    doctorName: "Dr. A. Rao",
    customerGstin: "27XYZPA9876Q1Z3",
    items: [
      {
        name: "Amoxicillin 500mg",
        batchNo: "B-AMOX-9",
        expiryDate: "2027-06-01",
        packQty: 2,
        looseQty: 0,
        unitsPerPack: 10,
        mrpPaise: 8500,
        ratePaise: 7500,
        discountBp: 0,
        gstRateBp: 1200,
        amountPaise: 15000,
      },
    ],
    payments: [
      {
        method: "upi",
        amountPaise: 15000,
      },
    ],
    grossPaise: 15000,
    discountPaise: 0,
    taxablePaise: 13393,
    cgstPaise: 804,
    sgstPaise: 803,
    igstPaise: 0,
    roundOffPaise: 0,
    totalPaise: 15000,
  };

  it("builds low-level ESC/P commands with form feed", () => {
    const builder = new EscPBuilder();
    builder.add(ESCP_COMMANDS.PITCH_10_CPI);
    builder.line("Dot Matrix Line 1");
    builder.formFeed();

    const bytes = builder.build();
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x50); // ESC P (10 CPI)
    expect(bytes[bytes.length - 1]).toBe(0x0c); // Form Feed (FF)
  });

  it("formats 80-column tax invoice with grid borders and statutory sections", () => {
    const bytes = buildEscPDotMatrixInvoice(sampleSale, {
      pitch: "10cpi",
      formFeed: true,
    });

    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("APOLLO MEDS WHOLESALE");
    expect(text).toContain("TAX INVOICE (CASH / CREDIT)");
    expect(text).toContain("AP01-2627-000102");
    expect(text).toContain("Buyer GSTIN: 27XYZPA9876Q1Z3");
    expect(text).toContain("| # | Product Particulars   | Batch    | Exp  | Qty    | Rate   | GST% | Total Rs |");
    expect(text).toContain("Amoxicillin 500mg");
    expect(text).toContain("B-AMOX-9");
    expect(text).toContain("NET AMOUNT PAYABLE: Rs 150.00");
    expect(text).toContain("Registered Pharmacist Signature");

    // Form feed at the end
    expect(bytes[bytes.length - 1]).toBe(0x0c);
  });

  it("supports condensed pitch for high-density printing", () => {
    const bytes = buildEscPDotMatrixInvoice(sampleSale, {
      pitch: "condensed",
      formFeed: false,
    });

    expect(bytes[0]).toBe(0x0f); // SI (Condensed Mode)
    expect(bytes[bytes.length - 1]).not.toBe(0x0c);
  });
});
