import { describe, it, expect } from "vitest";
import {
  detectBinaryContentMismatch,
  validateStockCsvMetadata,
  validateAndParseStockCsvText,
} from "@/lib/stock-csv-validator";

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
});
