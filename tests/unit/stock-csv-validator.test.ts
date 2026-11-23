import { describe, it, expect } from "vitest";
import {
  detectBinaryContentMismatch,
  validateStockCsvMetadata,
  validateAndParseStockCsvText,
} from "@/lib/stock-csv-validator";
import { computeBaseUnitCost, parsePackAndLooseQty } from "@/lib/packaging";
import { computeSaleLine } from "@/lib/money";

describe("Intelligent Stock CSV Validator", () => {
  it("rejects image, PDF, and binary Excel files by extension", () => {
    const pdf = new File(["%PDF-1.4"], "bill.pdf", { type: "application/pdf" });
    expect(validateStockCsvMetadata(pdf)).toMatch(/Scan PDF \/ Image \(OCR\)/);

    const jpg = new File(["img"], "shelf.jpg", { type: "image/jpeg" });
    expect(validateStockCsvMetadata(jpg)).toMatch(/Scan PDF \/ Image \(OCR\)/);

    const xlsx = new File(["PK"], "stock.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    expect(validateStockCsvMetadata(xlsx)).toMatch(/export it as a \.csv/i);
  });

  it("detects spoofed binary headers renamed to .csv", async () => {
    const fakePdfCsv = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "renamed.csv", {
      type: "text/csv",
    });
    expect(await detectBinaryContentMismatch(fakePdfCsv)).toMatch(/PDF/i);

    const fakeZipCsv = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14])], "book.csv", {
      type: "text/csv",
    });
    expect(await detectBinaryContentMismatch(fakeZipCsv)).toMatch(/ZIP\/Excel/i);

    const binaryNullCsv = new File([new Uint8Array([0x41, 0x00, 0x42])], "bin.csv", {
      type: "text/csv",
    });
    expect(await detectBinaryContentMismatch(binaryNullCsv)).toMatch(/binary file/i);
  });

  it("rejects non-stock CSVs such as customer or unrelated tables", () => {
    const customerCsv = "Customer Name,Phone,Email,City\nRamesh,9876543210,r@test.com,Pune";
    const res = validateAndParseStockCsvText(customerCsv, "customers.csv");
    expect(res.error).toMatch(/does not look like a stock\/batch CSV/i);
    expect(res.rows).toHaveLength(0);
  });

  it("accepts and parses valid pharmacy stock CSVs", () => {
    const stockCsv = "Medicine,Batch,Expiry,Qty,MRP,PTR\nDolo 650,B101,12/2027,20,30.00,24.00";
    const res = validateAndParseStockCsvText(stockCsv, "opening.csv");
    expect(res.error).toBeUndefined();
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].errors).toEqual([]);
    expect(res.rows[0].mapped.medicineName).toBe("Dolo 650");
    expect(res.rows[0].mapped.batchNo).toBe("B101");
    expect(res.rows[0].mapped.qty).toBe(20);
    expect(res.rows[0].mapped.mrp).toBe(3000);
    expect(res.rows[0].mapped.purchaseRate).toBe(2400);
  });

  it("parses the user's 6-row stock CSV without Pack column and flags solid-dose candidates", () => {
    const csv = [
      "STATUS,MEDICINE,BATCH,EXPIRY,QTY,MRP",
      "Available,Paracetamol 650mg,BT-2824,05/2027,209,₹35.00",
      "Available,Amoxicillin 500mg,PCM-5506,12/2027,77,₹80.00",
      "Available,Metformin 500mg,AMX-3286,08/2027,193,₹55.00",
      "Available,Amlodipine 5mg,MTF-9935,07/2027,171,₹35.00",
      "Available,Atorvastatin 10mg,AML-7912,06/2027,27,₹105.00",
      "Available,Pantoprazole 40mg,ATV-2535,11/2027,79,₹95.00",
    ].join("\n");

    const res = validateAndParseStockCsvText(csv, "stock.csv");
    expect(res.error).toBeUndefined();
    expect(res.rows).toHaveLength(6);
    expect(res.rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(res.rows.every((r) => r.isSolidDoseCandidate === true)).toBe(true);
    expect(res.rows.map((r) => r.mapped.expiryDate)).toEqual([
      "2027-05-31",
      "2027-12-31",
      "2027-08-31",
      "2027-07-31",
      "2027-06-30",
      "2027-11-30",
    ]);
    expect(res.rows.map((r) => r.mapped.mrp)).toEqual([3500, 8000, 5500, 3500, 10500, 9500]);
  });

  it("parses Pack, Loose, and Marg decimal columns accurately", () => {
    const csv = [
      "Medicine,Pack,Batch,Expiry,Qty,Loose,MRP,PTR",
      "Paracetamol 650mg,1x15,BT-2824,05/2027,10,4,35.00,28.00",
      "Benadryl Syrup,100ML,SYP-1,06/2027,5,0,120.00,90.00",
    ].join("\n");

    const res = validateAndParseStockCsvText(csv, "marg.csv");
    expect(res.error).toBeUndefined();
    expect(res.rows[0].mapped.unitsPerPack).toBe(15);
    expect(res.rows[0].mapped.looseQty).toBe(4);
    expect(res.rows[0].isSolidDoseCandidate).toBe(true);
    expect(res.rows[1].mapped.unitsPerPack).toBe(1);
    expect(res.rows[1].isSolidDoseCandidate).toBe(false);
  });

  it("verifies end-to-end Packs mode, Loose mode, unit cost, and POS loose deduction on the user's 6-row CSV", () => {
    const csv = [
      "STATUS,MEDICINE,BATCH,EXPIRY,QTY,MRP",
      "Available,Paracetamol 650mg,BT-2824,05/2027,209,₹35.00",
      "Available,Amoxicillin 500mg,PCM-5506,12/2027,77,₹80.00",
      "Available,Metformin 500mg,AMX-3286,08/2027,193,₹55.00",
      "Available,Amlodipine 5mg,MTF-9935,07/2027,171,₹35.00",
      "Available,Atorvastatin 10mg,AML-7912,06/2027,27,₹105.00",
      "Available,Pantoprazole 40mg,ATV-2535,11/2027,79,₹95.00",
    ].join("\n");

    const stripSizes: Record<string, number> = {
      "Paracetamol 650mg": 15,
      "Amoxicillin 500mg": 10,
      "Metformin 500mg": 10,
      "Amlodipine 5mg": 10,
      "Atorvastatin 10mg": 10,
      "Pantoprazole 40mg": 15,
    };

    const parsed = validateAndParseStockCsvText(csv, "user-sample.csv");
    expect(parsed.error).toBeUndefined();

    const packsModeTotals = parsed.rows.map((r) => {
      const upp = stripSizes[r.mapped.medicineName!];
      const { baseQty } = parsePackAndLooseQty(r.mapped.rawQtyText ?? r.mapped.qty, 0, upp, "packs");
      const baseCost = computeBaseUnitCost(r.mapped.purchaseRate ?? 0, upp);
      return { name: r.mapped.medicineName, baseQty, baseCost };
    });

    expect(packsModeTotals).toEqual([
      { name: "Paracetamol 650mg", baseQty: 3135, baseCost: 187 },
      { name: "Amoxicillin 500mg", baseQty: 770, baseCost: 640 },
      { name: "Metformin 500mg", baseQty: 1930, baseCost: 440 },
      { name: "Amlodipine 5mg", baseQty: 1710, baseCost: 280 },
      { name: "Atorvastatin 10mg", baseQty: 270, baseCost: 840 },
      { name: "Pantoprazole 40mg", baseQty: 1185, baseCost: 507 },
    ]);

    // Loose mode preserves raw counts
    expect(parsePackAndLooseQty("209", 0, 15, "loose").baseQty).toBe(209);
    expect(parsePackAndLooseQty("79", 0, 15, "loose").baseQty).toBe(79);

    // POS loose billing deduction & prorated pricing
    const pantoSale = computeSaleLine({
      packQty: 0,
      looseQty: 3,
      unitsPerPack: 15,
      rate: 9500,
      discountBp: 0,
      gstRateBp: 500,
    });
    expect(pantoSale.baseQty).toBe(3);
    expect(pantoSale.total).toBe(1900); // 3/15 * ₹95.00 = ₹19.00
    expect(1185 - pantoSale.baseQty).toBe(1182); // 78 strips + 12 tablets remaining

    const paraSale = computeSaleLine({
      packQty: 1,
      looseQty: 5,
      unitsPerPack: 15,
      rate: 3500,
      discountBp: 0,
      gstRateBp: 500,
    });
    expect(paraSale.baseQty).toBe(20);
    expect(paraSale.total).toBe(4667); // ₹35.00 + round(5 * 3500 / 15) = ₹46.67
    expect(3135 - paraSale.baseQty).toBe(3115); // 207 strips + 10 tablets remaining
  });
});
