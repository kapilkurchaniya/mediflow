import { describe, expect, it } from "vitest";
import { calculate6TierNrv } from "@/server/domain/accounting-year-end/closing-stock-nrv";
import { sanitizeCsvField, formatPaiseToRupees } from "@/server/domain/accounting-year-end/closing-stock-export";
import {
  getIndianFiscalYear,
  getNextFiscalYear,
  formatSimulatedDocNumber,
} from "@/server/domain/accounting-year-end/sequence-rollover";

describe("Year-End Stock Valuation & Rollover Unit Tests (A5.6)", () => {
  const cutoffDate = new Date("2026-03-31T23:59:59.999+05:30");

  describe("Evidence-Backed 6-Tier NRV under ICDS II / AS-2", () => {
    it("tier 1: active stock uses 90-day volume-weighted sales median less 2% costs", () => {
      const res = calculate6TierNrv(
        {
          expiryDate: "2027-06-30",
          landedCostPaise: 10000, // ₹100
          retailMedianSellingRatePaise: 12000, // ₹120
          catalogSaleRatePaise: 12500,
        },
        cutoffDate,
      );
      expect(res.classification).toBe("active");
      expect(res.nrvSource).toBe("sales_ledger");
      // 12000 - 2% (240) = 11760
      expect(res.estimatedNrvPaise).toBe(11760);
      expect(res.finalValuationPaisePerUnit).toBe(10000); // lower of cost (100) and nrv (117.6)
      expect(res.provisionPaisePerUnit).toBe(0);
    });

    it("tier 1: active stock with sales median below cost incurs lower of cost and NRV provision", () => {
      const res = calculate6TierNrv(
        {
          expiryDate: "2027-06-30",
          landedCostPaise: 10000, // ₹100
          retailMedianSellingRatePaise: 8000, // ₹80
          catalogSaleRatePaise: 9000,
        },
        cutoffDate,
      );
      expect(res.classification).toBe("active");
      // 8000 - 2% (160) = 7840
      expect(res.estimatedNrvPaise).toBe(7840);
      expect(res.finalValuationPaisePerUnit).toBe(7840);
      expect(res.provisionPaisePerUnit).toBe(2160); // 10000 - 7840
    });

    it("tier 2: near-expiry stock (30-90 days to cutoff) applies 20% policy haircut", () => {
      // Cutoff: 2026-03-31; Expiry: 2026-05-15 (~45 days)
      const res = calculate6TierNrv(
        {
          expiryDate: "2026-05-15",
          landedCostPaise: 10000,
          catalogSaleRatePaise: 10000,
        },
        cutoffDate,
      );
      expect(res.classification).toBe("near_expiry");
      expect(res.nrvSource).toBe("policy_rules");
      // base: 10000 - 2% = 9800, then 20% haircut = 7840
      expect(res.estimatedNrvPaise).toBe(7840);
      expect(res.finalValuationPaisePerUnit).toBe(7840);
      expect(res.provisionPaisePerUnit).toBe(2160);
    });

    it("tier 3: critical near-expiry stock (<30 days to cutoff) applies 80% policy haircut", () => {
      // Expiry: 2026-04-15 (~15 days post cutoff)
      const res = calculate6TierNrv(
        {
          expiryDate: "2026-04-15",
          landedCostPaise: 10000,
          catalogSaleRatePaise: 10000,
        },
        cutoffDate,
      );
      expect(res.classification).toBe("critical");
      // base: 9800 * 0.20 = 1960
      expect(res.estimatedNrvPaise).toBe(1960);
      expect(res.finalValuationPaisePerUnit).toBe(1960);
      expect(res.provisionPaisePerUnit).toBe(8040);
    });

    it("tier 4: expired stock on or before 31 March is written down 100% (NRV = 0)", () => {
      const res = calculate6TierNrv(
        {
          expiryDate: "2026-03-31",
          landedCostPaise: 15000,
          catalogSaleRatePaise: 20000,
        },
        cutoffDate,
      );
      expect(res.classification).toBe("expired");
      expect(res.estimatedNrvPaise).toBe(0);
      expect(res.finalValuationPaisePerUnit).toBe(0);
      expect(res.provisionPaisePerUnit).toBe(15000);
    });

    it("tier 5: damaged stock is written down 100% unless covered by supplier claim", () => {
      const res = calculate6TierNrv(
        {
          expiryDate: "2027-01-01",
          landedCostPaise: 5000,
          catalogSaleRatePaise: 7000,
          explicitClassification: "damaged",
        },
        cutoffDate,
      );
      expect(res.classification).toBe("damaged");
      expect(res.estimatedNrvPaise).toBe(0);
      expect(res.finalValuationPaisePerUnit).toBe(0);
      expect(res.provisionPaisePerUnit).toBe(5000);
    });

    it("tier 6: quarantined stock is held at landed cost pending inspection", () => {
      const res = calculate6TierNrv(
        {
          expiryDate: "2027-01-01",
          landedCostPaise: 8000,
          catalogSaleRatePaise: 10000,
          explicitClassification: "quarantined",
        },
        cutoffDate,
      );
      expect(res.classification).toBe("quarantined");
      expect(res.estimatedNrvPaise).toBe(8000);
      expect(res.finalValuationPaisePerUnit).toBe(8000);
      expect(res.provisionPaisePerUnit).toBe(0);
    });
  });

  describe("Sequence Rollover & GST Rule 46(b) Invariants", () => {
    it("derives Indian fiscal year spanning 1 April to 31 March in Asia/Kolkata", () => {
      expect(getIndianFiscalYear(new Date("2026-03-31T23:59:59+05:30"))).toBe("2025-2026");
      expect(getIndianFiscalYear(new Date("2026-04-01T00:00:00+05:30"))).toBe("2026-2027");
      expect(getNextFiscalYear("2025-2026")).toBe("2026-2027");
    });

    it("formats simulated sequence resetting to 1 without exceeding GST Rule 46(b) 16 chars", () => {
      const formatted = formatSimulatedDocNumber("INV", "2026-2027", 1);
      // Format: INV/26-27/000001
      expect(formatted).toBe("INV/26-27/000001");
      expect(formatted.length).toBeLessThanOrEqual(16);
    });
  });

  describe("CSV Formula Injection Sanitization", () => {
    it("neutralizes potential spreadsheet injection vectors (=, +, -, @, \\t, \\r)", () => {
      expect(sanitizeCsvField("=cmd|'/C calc'!A0")).toBe("\"'=cmd|'/C calc'!A0\"");
      expect(sanitizeCsvField("+12345")).toBe("\"'+12345\"");
      expect(sanitizeCsvField("-999")).toBe("\"'-999\"");
      expect(sanitizeCsvField("@SUM(A1:A10)")).toBe("\"'@SUM(A1:A10)\"");
      expect(sanitizeCsvField("\tTabPrefixed")).toBe("\"'\tTabPrefixed\"");
      expect(sanitizeCsvField("Normal Medicine 500mg")).toBe("\"Normal Medicine 500mg\"");
    });

    it("formats paise to rupees cleanly", () => {
      expect(formatPaiseToRupees(123456)).toBe("1234.56");
      expect(formatPaiseToRupees(0)).toBe("0.00");
    });
  });
});
