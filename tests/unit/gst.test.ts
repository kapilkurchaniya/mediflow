import { describe, expect, it } from "vitest";
import {
  isValidGstin,
  computeGstinCheckDigit,
  extractStateCodeFromGstin,
  determineTaxContext,
  determineSupplyType,
  getStateName,
} from "@/server/domain/gst";
import { B2CL_THRESHOLD_PAISE } from "@/lib/regulatory";

describe("GSTIN Checksum & Validation (Luhn mod-36)", () => {
  it("computes accurate mod-36 check digits for official sample GSTINs", () => {
    expect(computeGstinCheckDigit("27GSPTE0985F1Z")).toBe("5");
    expect(computeGstinCheckDigit("24AAACC1206D1Z")).toBe("M");
    expect(computeGstinCheckDigit("33AABCT1332L1Z")).toBe("L");
    expect(computeGstinCheckDigit("07AAAAA0000A1Z")).toBe("4");
    expect(computeGstinCheckDigit("27AAPCS1234F1Z")).toBe("D");
  });

  it("validates correct GSTINs", () => {
    expect(isValidGstin("27GSPTE0985F1Z5")).toBe(true);
    expect(isValidGstin("24AAACC1206D1ZM")).toBe(true);
    expect(isValidGstin("33AABCT1332L1ZL")).toBe(true);
    expect(isValidGstin("07AAAAA0000A1Z4")).toBe(true);
    // handles lowercase input cleanly
    expect(isValidGstin("27gspte0985f1z5")).toBe(true);
  });

  it("rejects GSTINs with invalid checksum digit", () => {
    // 27GSPTE0985F1Z5 with wrong check digits
    expect(isValidGstin("27GSPTE0985F1Z9")).toBe(false);
    expect(isValidGstin("27GSPTE0985F1ZA")).toBe(false);
  });

  it("rejects malformed, empty or null GSTINs", () => {
    expect(isValidGstin("")).toBe(false);
    expect(isValidGstin(null)).toBe(false);
    expect(isValidGstin(undefined)).toBe(false);
    expect(isValidGstin("INVALID_GSTIN")).toBe(false);
    expect(isValidGstin("27GSPTE0985F1Z")).toBe(false); // only 14 chars
    expect(isValidGstin("27GSPTE0985F1Z55")).toBe(false); // 16 chars
    expect(isValidGstin("999999999999999")).toBe(false);
  });
});

describe("extractStateCodeFromGstin", () => {
  it("extracts 2-digit state code", () => {
    expect(extractStateCodeFromGstin("27GSPTE0985F1Z5")).toBe("27");
    expect(extractStateCodeFromGstin("07AAAAA0000A1Z4")).toBe("07");
    expect(extractStateCodeFromGstin("24AAACC1206D1ZM")).toBe("24");
  });

  it("returns null for invalid or missing inputs", () => {
    expect(extractStateCodeFromGstin("")).toBe(null);
    expect(extractStateCodeFromGstin("A")).toBe(null);
    expect(extractStateCodeFromGstin("AA123")).toBe(null);
    expect(extractStateCodeFromGstin(null)).toBe(null);
    expect(extractStateCodeFromGstin(undefined)).toBe(null);
  });
});

describe("determineTaxContext (B1.2 Inter-state determination)", () => {
  const storeStateCode = "27"; // Maharashtra
  const storeGstin = "27AAPCS1234F1ZD";

  it("Combination 1: B2B Intra-state (Customer has valid GSTIN in store state)", () => {
    const ctx = determineTaxContext({
      storeStateCode,
      storeGstin,
      customerGstin: "27GSPTE0985F1Z5", // MH
    });
    expect(ctx).toEqual({
      supplyType: "B2B",
      placeOfSupply: "27",
      isInterState: false,
    });
  });

  it("Combination 2: B2B Inter-state (Customer has valid GSTIN in another state)", () => {
    const ctx = determineTaxContext({
      storeStateCode,
      storeGstin,
      customerGstin: "24AAACC1206D1ZM", // Gujarat (24)
    });
    expect(ctx).toEqual({
      supplyType: "B2B",
      placeOfSupply: "24",
      isInterState: true,
    });
  });

  it("Combination 3: B2C Intra-state (No customer GSTIN)", () => {
    const ctx = determineTaxContext({
      storeStateCode,
      storeGstin,
      customerGstin: null,
    });
    expect(ctx).toEqual({
      supplyType: "B2C",
      placeOfSupply: "27",
      isInterState: false,
    });
  });

  it("Combination 4: B2C Counter sale with different customerStateCode provided (never inter-state)", () => {
    const ctx = determineTaxContext({
      storeStateCode,
      storeGstin,
      customerGstin: null,
      customerStateCode: "29", // Karnataka customer visiting MH counter
    });
    expect(ctx).toEqual({
      supplyType: "B2C",
      placeOfSupply: "27",
      isInterState: false,
    });
  });

  it("Handles invalid GSTIN by falling back to B2C intra-state counter sale", () => {
    // Bad format
    const ctx1 = determineTaxContext({
      storeStateCode,
      storeGstin,
      customerGstin: "INVALID_GST",
    });
    expect(ctx1).toEqual({
      supplyType: "B2C",
      placeOfSupply: "27",
      isInterState: false,
    });

    // Wrong checksum digit
    const ctx2 = determineTaxContext({
      storeStateCode,
      storeGstin,
      customerGstin: "27GSPTE0985F1Z9", // Checksum should be 5, not 9
    });
    expect(ctx2).toEqual({
      supplyType: "B2C",
      placeOfSupply: "27",
      isInterState: false,
    });
  });
});

describe("determineSupplyType & B2CL threshold (B1.1)", () => {
  it("returns EXPORT if isExport is true", () => {
    expect(
      determineSupplyType({
        sellerStateCode: "27",
        buyerStateCode: "99",
        isExport: true,
      })
    ).toBe("EXPORT");
  });

  it("returns B2B if buyer has a 15-character GSTIN", () => {
    expect(
      determineSupplyType({
        sellerStateCode: "27",
        buyerStateCode: "27",
        buyerGstin: "27GSPTE0985F1Z5",
      })
    ).toBe("B2B");
  });

  it("returns B2CL for inter-state B2C sale exceeding B2CL_THRESHOLD_PAISE", () => {
    expect(
      determineSupplyType({
        sellerStateCode: "27",
        buyerStateCode: "24",
        totalAmountPaise: B2CL_THRESHOLD_PAISE + 100, // ₹2,50,001
      })
    ).toBe("B2CL");
  });

  it("returns B2C for inter-state B2C sale at or below B2CL_THRESHOLD_PAISE", () => {
    expect(
      determineSupplyType({
        sellerStateCode: "27",
        buyerStateCode: "24",
        totalAmountPaise: B2CL_THRESHOLD_PAISE, // exactly ₹2,50,000
      })
    ).toBe("B2C");
  });

  it("returns B2C for intra-state sale even above ₹2,50,000 without GSTIN", () => {
    expect(
      determineSupplyType({
        sellerStateCode: "27",
        buyerStateCode: "27",
        totalAmountPaise: B2CL_THRESHOLD_PAISE + 10_000_000,
      })
    ).toBe("B2C");
  });
});

describe("getStateName", () => {
  it("resolves state codes to names", () => {
    expect(getStateName("27")).toBe("Maharashtra");
    expect(getStateName("24")).toBe("Gujarat");
    expect(getStateName("07")).toBe("Delhi");
  });

  it("pads single digit code", () => {
    expect(getStateName("7")).toBe("Delhi");
  });

  it("handles unknown or missing code", () => {
    expect(getStateName(null)).toBe("Unknown");
    expect(getStateName("99")).toBe("State (99)");
  });
});
