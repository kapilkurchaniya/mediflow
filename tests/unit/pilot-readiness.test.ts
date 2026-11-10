import { describe, it, expect } from "vitest";
import {
  compareDailyTotals,
  formatReconciliationSummaryCsv,
  type DayTotalsSummary,
} from "../../src/server/domain/pilot/reconciliation";
import {
  sanitizeFeedbackPii,
  pilotFeedbackSchema,
} from "../../src/server/domain/pilot/feedback";

describe("Task B6.6: Pilot Operations & Reconciliation Engine", () => {
  const baseTotals: DayTotalsSummary = {
    grossSalesPaise: 1050000,
    taxableAmountPaise: 1000000,
    cgstPaise: 25000,
    sgstPaise: 25000,
    totalTaxPaise: 50000,
    netSalesPaise: 1050000,
    cashCollectedPaise: 650000,
    digitalCollectedPaise: 400000,
    creditSalesPaise: 0,
    totalBillsCount: 15,
    cancelledBillsCount: 1,
  };

  const context = {
    date: "2026-11-10",
    storeId: "store-flagship-01",
    legacySystem: "MARG",
  };

  describe("Daily Totals Reconciliation Math", () => {
    it("flags 100% exact match between MediFlow and Marg ERP", () => {
      const res = compareDailyTotals(baseTotals, { ...baseTotals }, context);

      expect(res.status).toBe("MATCH");
      expect(res.discrepancies).toHaveLength(0);
      expect(res.deltas.netSalesPaise).toBe(0);
      expect(res.summaryNote).toContain("match 100%");
    });

    it("classifies minor rounding differences (<= Rs 2) as TOLERABLE_ROUNDING", () => {
      const legacyWithRoundingDrift: DayTotalsSummary = {
        ...baseTotals,
        netSalesPaise: baseTotals.netSalesPaise - 150, // Rs 1.50 rounding delta
        taxableAmountPaise: baseTotals.taxableAmountPaise - 100,
      };

      const res = compareDailyTotals(baseTotals, legacyWithRoundingDrift, context);

      expect(res.status).toBe("TOLERABLE_ROUNDING");
      expect(res.discrepancies.length).toBeGreaterThan(0);
      expect(res.discrepancies.every((d) => d.severity === "warning")).toBe(true);
      expect(res.discrepancies.some((d) => d.severity === "critical")).toBe(false);
    });

    it("flags critical discrepancies (> Rs 2 or bill count mismatch)", () => {
      const legacyWithMissingBills: DayTotalsSummary = {
        ...baseTotals,
        netSalesPaise: baseTotals.netSalesPaise - 50000, // Rs 500 mismatch
        totalBillsCount: baseTotals.totalBillsCount - 2, // 2 missing bills
      };

      const res = compareDailyTotals(baseTotals, legacyWithMissingBills, context);

      expect(res.status).toBe("CRITICAL_MISMATCH");
      expect(res.discrepancies.some((d) => d.severity === "critical")).toBe(true);
      expect(res.summaryNote).toContain("critical variances");
    });

    it("generates clean UTF-8 BOM CSV summary for audit reviews", () => {
      const res = compareDailyTotals(baseTotals, { ...baseTotals }, context);
      const csv = formatReconciliationSummaryCsv(res);

      expect(csv.startsWith("\uFEFF")).toBe(true);
      expect(csv).toContain('"Net Sales (Rs)"');
      expect(csv).toContain('"MATCH"');
      expect(csv).toContain('"10500.00"');
    });
  });

  describe("Pilot Feedback & Diagnostic Collector", () => {
    it("sanitizes sensitive PII (card and Aadhaar numbers) for DPDP compliance", () => {
      const rawText = "Card payment failure on card 4111 2222 3333 4444 and patient Aadhaar 1234 5678 9012.";
      const sanitized = sanitizeFeedbackPii(rawText);

      expect(sanitized).not.toContain("4111");
      expect(sanitized).not.toContain("1234 5678 9012");
      expect(sanitized).toContain("[REDACTED-CARD]");
      expect(sanitized).toContain("[REDACTED-ID]");
    });

    it("validates pilot feedback input correctly", () => {
      const valid = pilotFeedbackSchema.safeParse({
        category: "scanner",
        severity: "high",
        summary: "Barcode scanner buffer delay on Dolo 650",
        details: "Scanning consecutive strips causes the last digit to drop intermittently.",
      });
      expect(valid.success).toBe(true);

      const invalidCategory = pilotFeedbackSchema.safeParse({
        category: "invalid_category",
        summary: "Short",
        details: "Too short",
      });
      expect(invalidCategory.success).toBe(false);
    });
  });
});
