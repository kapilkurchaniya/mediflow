import { describe, it, expect } from "vitest";
import { buildEscPosReceipt, ESCPOS_COMMANDS, EscPosBuilder } from "@/desktop/escpos";
import type { SalePrintData } from "@/desktop/types";

describe("ESC/POS Binary Builder & Formatter", () => {
  const sampleSale: SalePrintData = {
    storeName: "Apollo Pharmacy Main",
    storeAddress: "123 MG Road, Mumbai",
    storePhone: "+91 9876543210",
    storeGstin: "27AAAAA0000A1Z5",
    storeDlNumbers: ["20B/1234", "21B/5678"],
    invoiceNo: "AP01-2627-000101",
    completedAt: "2026-11-04T12:00:00.000Z",
    cashierName: "John Doe",
    patientName: "Alice Sharma",
    doctorName: "Dr. K. Mehta",
    items: [
      {
        name: "Paracetamol 500mg",
        batchNo: "B-PARA-01",
        expiryDate: "2027-11-01",
        packQty: 1,
        looseQty: 0,
        unitsPerPack: 10,
        packUnit: "Strip",
        looseUnit: "Tab",
        mrpPaise: 1500,
        ratePaise: 1500,
        discountBp: 0,
        gstRateBp: 1200,
        amountPaise: 1500,
      },
    ],
    payments: [
      {
        method: "cash",
        amountPaise: 1500,
      },
    ],
    grossPaise: 1500,
    discountPaise: 0,
    taxablePaise: 1339,
    cgstPaise: 80,
    sgstPaise: 81,
    igstPaise: 0,
    roundOffPaise: 0,
    totalPaise: 1500,
    upiQrPayload: "upi://pay?pa=apollo@upi&am=15.00&pn=Apollo",
  };

  it("builds a low-level command stream with init and paper cut", () => {
    const builder = new EscPosBuilder();
    builder.add(ESCPOS_COMMANDS.INIT);
    builder.text("Hello MediFlow");
    builder.line();
    builder.add(ESCPOS_COMMANDS.CUT_PARTIAL);

    const bytes = builder.build();
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40); // ESC @
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("Hello MediFlow");
    // Verify partial cut bytes at the end
    expect(bytes[bytes.length - 4]).toBe(0x1d);
    expect(bytes[bytes.length - 3]).toBe(0x56);
    expect(bytes[bytes.length - 2]).toBe(0x42);
    expect(bytes[bytes.length - 1]).toBe(0x00);
  });

  it("formats an 80mm thermal receipt with drawer pulse and UPI QR code", () => {
    const bytes = buildEscPosReceipt(sampleSale, {
      widthCols: 48,
      kickDrawer: true,
      printUpiQr: true,
      cutPaper: true,
    });

    expect(bytes.length).toBeGreaterThan(100);

    // Verify initial drawer kick
    expect(bytes[2]).toBe(0x1b);
    expect(bytes[3]).toBe(0x70); // ESC p
    expect(bytes[4]).toBe(0x00);
    expect(bytes[5]).toBe(0x19);
    expect(bytes[6]).toBe(0xfa);

    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Apollo Pharmacy Main");
    expect(decoded).toContain("AP01-2627-000101");
    expect(decoded).toContain("Paracetamol 500mg");
    expect(decoded).toContain("B-PARA-01");
    expect(decoded).toContain("Rs 15.00");
    expect(decoded).toContain("Scan to Pay via UPI");
  });

  it("formats a 32-column receipt for 58mm mini thermal printer", () => {
    const bytes = buildEscPosReceipt(sampleSale, {
      widthCols: 32,
      kickDrawer: false,
      cutPaper: false,
      printUpiQr: false,
    });

    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain("Apollo Pharmacy Main");
    expect(decoded).toContain("AP01-2627-000101");
    expect(decoded).toContain("B:B-PARA-0");
    expect(decoded).not.toContain("Scan to Pay via UPI");
  });
});
