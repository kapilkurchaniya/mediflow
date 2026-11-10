import { describe, it, expect } from "vitest";
import {
  deriveStateFromGstin,
  validateInvoicePrefix,
  GSTIN_REGEX,
} from "@/server/domain/onboarding/types";
import { ESSENTIAL_STARTER_MEDICINES } from "@/server/domain/onboarding/starter-catalog";
import { GST_STATE_CODES } from "@/lib/regulatory";

describe("Onboarding Wizard Domain Logic (Task B6.3)", () => {
  describe("GSTIN & State Code Derivation", () => {
    it("successfully derives 2-digit state code, state name, and PAN from valid Maharashtra GSTIN", () => {
      const gstin = "27AABCU9603R1ZM";
      const result = deriveStateFromGstin(gstin);

      expect(result.isValid).toBe(true);
      expect(result.stateCode).toBe("27");
      expect(result.stateName).toBe("Maharashtra");
      expect(result.pan).toBe("AABCU9603R");
    });

    it("successfully derives Delhi state code (07) and PAN from valid Delhi GSTIN", () => {
      const gstin = "07AAAAA0000A1Z5";
      const result = deriveStateFromGstin(gstin);

      expect(result.isValid).toBe(true);
      expect(result.stateCode).toBe("07");
      expect(result.stateName).toBe("Delhi");
      expect(result.pan).toBe("AAAAA0000A");
    });

    it("successfully derives Karnataka state code (29) from valid Karnataka GSTIN", () => {
      const gstin = "29ABCDE1234F1Z5";
      const result = deriveStateFromGstin(gstin);

      expect(result.isValid).toBe(true);
      expect(result.stateCode).toBe("29");
      expect(result.stateName).toBe("Karnataka");
      expect(result.pan).toBe("ABCDE1234F");
    });

    it("handles partial or lowercase GSTIN gracefully", () => {
      const partial = "24aab";
      const result = deriveStateFromGstin(partial);

      expect(result.isValid).toBe(false);
      expect(result.stateCode).toBe("24");
      expect(result.stateName).toBe("Gujarat");
      expect(result.pan).toBe("");
    });

    it("handles empty or single-character GSTIN without throwing", () => {
      const empty = deriveStateFromGstin("");
      expect(empty.isValid).toBe(false);
      expect(empty.stateCode).toBe("");
      expect(empty.stateName).toBe("");

      const single = deriveStateFromGstin("2");
      expect(single.isValid).toBe(false);
      expect(single.stateCode).toBe("");
    });

    it("strictly verifies standard 15-character GSTIN format via regex", () => {
      expect(GSTIN_REGEX.test("27AABCU9603R1ZM")).toBe(true);
      expect(GSTIN_REGEX.test("INVALID_GSTIN_123")).toBe(false);
      expect(GSTIN_REGEX.test("27AABCU9603R1Z")).toBe(false); // 14 chars
      expect(GSTIN_REGEX.test("27AABCU9603R1ZMM")).toBe(false); // 16 chars
    });
  });

  describe("Invoice Prefix Validation (GST Rule 46b)", () => {
    it("accepts valid canonical prefixes with letters, numbers, hyphens, and slashes", () => {
      expect(validateInvoicePrefix("INV").valid).toBe(true);
      expect(validateInvoicePrefix("STR1").valid).toBe(true);
      expect(validateInvoicePrefix("POS-A").valid).toBe(true);
      expect(validateInvoicePrefix("MED/26").valid).toBe(true);
      expect(validateInvoicePrefix("MF-01").valid).toBe(true);
    });

    it("rejects empty or whitespace-only invoice prefixes", () => {
      const result = validateInvoicePrefix("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("required");
    });

    it("rejects invoice prefixes exceeding 8 characters to preserve space for 16-char rule", () => {
      const result = validateInvoicePrefix("INVOICEXYZ");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("8 characters");
    });

    it("rejects invoice prefixes with illegal punctuation or spaces per GST Rule 46(b)", () => {
      expect(validateInvoicePrefix("INV 01").valid).toBe(false);
      expect(validateInvoicePrefix("INV#01").valid).toBe(false);
      expect(validateInvoicePrefix("INV@A").valid).toBe(false);
      expect(validateInvoicePrefix("INV.01").valid).toBe(false);
    });
  });

  describe("Essential Starter Catalogue Parity", () => {
    it("includes at least 10 high-frequency Indian formulations", () => {
      expect(ESSENTIAL_STARTER_MEDICINES.length).toBeGreaterThanOrEqual(10);
    });

    it("ensures every formulation has compliant HSN 3004 and valid pharmaceutical tax rate", () => {
      for (const item of ESSENTIAL_STARTER_MEDICINES) {
        expect(item.hsnCode.startsWith("3004")).toBe(true);
        expect([0, 500, 1200, 1800]).toContain(item.gstRateBp);
        expect(item.mrpPaise).toBeGreaterThan(0);
        expect(item.purchasePricePaise).toBeGreaterThan(0);
        expect(item.mrpPaise).toBeGreaterThan(item.purchasePricePaise);
        expect(["H", "H1", "X", "OTC"]).toContain(item.schedule);
      }
    });

    it("contains statutory scheduled drugs requiring doctor prescription (H & H1)", () => {
      const scheduledH1 = ESSENTIAL_STARTER_MEDICINES.filter((m) => m.schedule === "H1");
      const scheduledH = ESSENTIAL_STARTER_MEDICINES.filter((m) => m.schedule === "H");

      expect(scheduledH1.length).toBeGreaterThanOrEqual(2); // e.g. Augmentin 625, Azithral 500
      expect(scheduledH.length).toBeGreaterThanOrEqual(3); // e.g. Pan 40, Glycomet, Telma
    });
  });
});

