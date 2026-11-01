import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { detectPresetAndMapping } from "@/server/domain/import/presets";

function parseCsvHeaders(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf8");
  const firstLine = content.split(/\r?\n/)[0];
  return firstLine
    .split(",")
    .map((h) => h.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

describe("Import Presets & Auto-Detection (Task B4.2)", () => {
  const fixturesDir = path.resolve(__dirname, "../fixtures/marg");

  it("detects Marg Item Master V1 and auto-maps all core fields", () => {
    const v1Path = path.join(fixturesDir, "marg_item_master_v1.csv");
    const headers = parseCsvHeaders(v1Path);

    const result = detectPresetAndMapping(headers, "medicines");
    expect(result.detectedSource).toBe("marg");
    expect(result.confidence).toBeGreaterThan(0.7);

    // Verify key mappings
    expect(result.mapping["ITEM NAME"]).toBe("name");
    expect(result.mapping["PACKING"]).toBe("packaging");
    expect(result.mapping["COMPANY"]).toBe("manufacturerName");
    expect(result.mapping["HSN"]).toBe("hsn");
    expect(result.mapping["GST%"]).toBe("gstRate");
    expect(result.mapping["MRP"]).toBe("mrp");
    expect(result.mapping["RATE"]).toBe("saleRate");
    expect(result.mapping["COST"]).toBe("purchaseCost");
    expect(result.mapping["RACK"]).toBe("rackLocation");
  });

  it("detects Marg Item Master V2 with snake_case and auto-maps fields", () => {
    const v2Path = path.join(fixturesDir, "marg_item_master_v2.csv");
    const headers = parseCsvHeaders(v2Path);

    const result = detectPresetAndMapping(headers, "medicines");
    expect(result.detectedSource).toBe("marg");

    expect(result.mapping["Item_Description"]).toBe("name");
    expect(result.mapping["Packing_Info"]).toBe("packaging");
    expect(result.mapping["Mfr_Name"]).toBe("manufacturerName");
    expect(result.mapping["HSN_SAC"]).toBe("hsn");
    expect(result.mapping["Tax_Rate"]).toBe("gstRate");
    expect(result.mapping["Max_Retail_Price"]).toBe("mrp");
    expect(result.mapping["Selling_Rate"]).toBe("saleRate");
    expect(result.mapping["Purchase_Cost"]).toBe("purchaseCost");
    expect(result.mapping["Rack_Location"]).toBe("rackLocation");
  });

  it("detects Marg Party Master and auto-maps customer & supplier headers", () => {
    const partyPath = path.join(fixturesDir, "marg_party_master.csv");
    const headers = parseCsvHeaders(partyPath);

    const result = detectPresetAndMapping(headers, "customers");
    expect(result.detectedSource).toBe("marg");

    expect(result.mapping["PARTY NAME"]).toBe("name");
    expect(result.mapping["PARTY CODE"]).toBe("code");
    expect(result.mapping["STATION"]).toBe("city");
    expect(result.mapping["ADDRESS"]).toBe("address");
    expect(result.mapping["PHONE"]).toBe("phone");
    expect(result.mapping["MOBILE"]).toBe("mobile");
    expect(result.mapping["GSTIN"]).toBe("gstin");
  });

  it("detects Marg Stock Ledger and auto-maps batch inventory fields", () => {
    const stockPath = path.join(fixturesDir, "marg_stock_ledger.csv");
    const headers = parseCsvHeaders(stockPath);

    const result = detectPresetAndMapping(headers, "batches");
    expect(result.detectedSource).toBe("marg");

    expect(result.mapping["ITEM NAME"]).toBe("medicineCodeOrName");
    expect(result.mapping["BATCH NO"]).toBe("batchNo");
    expect(result.mapping["EXPIRY"]).toBe("expiryDate");
    expect(result.mapping["CLOSING QTY"]).toBe("closingQty");
    expect(result.mapping["MRP"]).toBe("mrp");
    expect(result.mapping["PUR RATE"]).toBe("purchaseRate");
  });

  it("detects GoFrugal headers when provided", () => {
    const gofrugalHeaders = [
      "ItemName",
      "PackSize",
      "Manufacturer",
      "HSNCode",
      "TaxPercentage",
      "MaxRetailPrice",
      "SaleRate",
      "PurchaseRate",
      "BinLocation",
    ];

    const result = detectPresetAndMapping(gofrugalHeaders, "medicines");
    expect(result.detectedSource).toBe("gofrugal");
    expect(result.mapping["ItemName"]).toBe("name");
    expect(result.mapping["PackSize"]).toBe("packaging");
    expect(result.mapping["TaxPercentage"]).toBe("gstRate");
    expect(result.mapping["BinLocation"]).toBe("rackLocation");
  });

  it("falls back to generic mapping when headers match standard terms", () => {
    const genericHeaders = ["name", "code", "mrp", "hsn", "rack", "packaging"];
    const result = detectPresetAndMapping(genericHeaders, "medicines");
    expect(result.detectedSource).toBe("generic");
    expect(result.mapping["name"]).toBe("name");
    expect(result.mapping["mrp"]).toBe("mrp");
  });
});

