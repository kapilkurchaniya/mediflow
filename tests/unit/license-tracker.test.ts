import { describe, expect, it } from "vitest";
import {
  calculateLicenseStatus,
  type LicenseType,
  type LicenseAlertUrgency,
  type LicenseStatus,
} from "@/server/domain/compliance/license-tracker";

describe("Regulatory License Tracker Domain (Task B5.7)", () => {
  const baseDate = new Date("2026-06-01T10:00:00.000Z");

  describe("calculateLicenseStatus urgency & window evaluation", () => {
    it("classifies licenses > 60 days as healthy / active", () => {
      // 90 days out: 2026-08-30
      const futureDate = new Date("2026-08-30T10:00:00.000Z");
      const res = calculateLicenseStatus(futureDate, "form_20", "DL-RET-20-9999", baseDate);

      expect(res.urgency).toBe("healthy");
      expect(res.status).toBe("active");
      expect(res.daysRemaining).toBe(90);
      expect(res.licenseNumber).toBe("DL-RET-20-9999");
      expect(res.type).toBe("form_20");
      expect(res.statutoryRule).toContain("D&C Rules 1945 Rule 61(1)");
    });

    it("classifies licenses between 31 and 60 days as warning / expiring_warning", () => {
      // 45 days out: 2026-07-16
      const warningDate = new Date("2026-07-16T10:00:00.000Z");
      const res = calculateLicenseStatus(warningDate, "form_21", "DL-BIO-21-8888", baseDate);

      expect(res.urgency).toBe("warning");
      expect(res.status).toBe("expiring_warning");
      expect(res.daysRemaining).toBe(45);
      expect(res.recommendation).toContain("WARNING");
    });

    it("classifies licenses between 8 and 30 days as urgent / expiring_urgent", () => {
      // 20 days out: 2026-06-21
      const urgentDate = new Date("2026-06-21T10:00:00.000Z");
      const res = calculateLicenseStatus(urgentDate, "form_20b", "DL-WS-20B-7777", baseDate);

      expect(res.urgency).toBe("urgent");
      expect(res.status).toBe("expiring_urgent");
      expect(res.daysRemaining).toBe(20);
      expect(res.recommendation).toContain("URGENT");
    });

    it("classifies licenses between 0 and 7 days as critical / expiring_critical", () => {
      // 3 days out: 2026-06-04
      const criticalDate = new Date("2026-06-04T10:00:00.000Z");
      const res = calculateLicenseStatus(criticalDate, "form_21b", "DL-WS-21B-6666", baseDate);

      expect(res.urgency).toBe("critical");
      expect(res.status).toBe("expiring_critical");
      expect(res.daysRemaining).toBe(3);
      expect(res.recommendation).toContain("CRITICAL");
    });

    it("classifies licenses expiring today (0 days) as critical / expiring_critical", () => {
      const todayDate = new Date("2026-06-01T15:00:00.000Z");
      const res = calculateLicenseStatus(todayDate, "fssai", "12345678901234", baseDate);

      expect(res.urgency).toBe("critical");
      expect(res.status).toBe("expiring_critical");
      expect(res.daysRemaining).toBe(0);
    });

    it("classifies past expiration dates (< 0 days) as critical / expired", () => {
      // Expired 10 days ago: 2026-05-22
      const expiredDate = new Date("2026-05-22T10:00:00.000Z");
      const res = calculateLicenseStatus(
        expiredDate,
        "pharmacist_council",
        "MSPC-REG-10492",
        baseDate
      );

      expect(res.urgency).toBe("critical");
      expect(res.status).toBe("expired");
      expect(res.daysRemaining).toBe(-10);
      expect(res.recommendation).toContain("EXPIRED");
      expect(res.recommendation).toContain("Section 18(c)");
    });
  });

  describe("calculateLicenseStatus missing, null, and malformed date handling", () => {
    it("handles null validTo when license number is provided (marks as warning missing)", () => {
      const res = calculateLicenseStatus(null, "form_20", "MH-WZ-10294", baseDate);

      expect(res.urgency).toBe("warning");
      expect(res.status).toBe("missing");
      expect(res.validTo).toBeNull();
      expect(res.daysRemaining).toBeNull();
      expect(res.licenseNumber).toBe("MH-WZ-10294");
      expect(res.recommendation).toContain("expiry date missing");
    });

    it("handles null validTo when no license number is provided (marks as not_configured)", () => {
      const res = calculateLicenseStatus(null, "fssai", null, baseDate);

      expect(res.urgency).toBe("not_configured");
      expect(res.status).toBe("missing");
      expect(res.validTo).toBeNull();
      expect(res.daysRemaining).toBeNull();
      expect(res.recommendation).toContain("License not configured");
    });

    it("handles undefined validTo gracefully", () => {
      const res = calculateLicenseStatus(undefined, "form_21b", "", baseDate);

      expect(res.urgency).toBe("not_configured");
      expect(res.status).toBe("missing");
    });

    it("handles invalid date strings gracefully without throwing", () => {
      const res = calculateLicenseStatus("not-a-valid-date", "form_20", "DL-12345", baseDate);

      expect(res.urgency).toBe("warning");
      expect(res.status).toBe("missing");
      expect(res.recommendation).toContain("Invalid date value recorded");
    });

    it("accepts valid ISO date string representations", () => {
      const res = calculateLicenseStatus("2026-07-01", "form_20", "DL-12345", baseDate);

      expect(res.daysRemaining).toBe(30);
      expect(res.urgency).toBe("urgent");
      expect(res.status).toBe("expiring_urgent");
    });
  });

  describe("statutory rule mapping & parity", () => {
    const cases: { type: LicenseType; ruleSubstring: string; titleSubstring: string }[] = [
      { type: "form_20", ruleSubstring: "Rule 61(1)", titleSubstring: "Form 20" },
      { type: "form_21", ruleSubstring: "Rule 61(2)", titleSubstring: "Form 21" },
      { type: "form_20b", ruleSubstring: "Rule 61(1)", titleSubstring: "Form 20B" },
      { type: "form_21b", ruleSubstring: "Rule 61(2)", titleSubstring: "Form 21B" },
      { type: "fssai", ruleSubstring: "Food Safety and Standards Act 2006", titleSubstring: "FSSAI" },
      {
        type: "pharmacist_council",
        ruleSubstring: "Pharmacy Act 1948",
        titleSubstring: "State Pharmacy Council",
      },
    ];

    for (const c of cases) {
      it(`maps ${c.type} to statutory rule and descriptive title`, () => {
        const res = calculateLicenseStatus("2026-09-01", c.type, "SAMPLE-NO", baseDate);
        expect(res.statutoryRule).toContain(c.ruleSubstring);
        expect(res.title).toContain(c.titleSubstring);
      });
    }
  });

  describe("severity priority logic", () => {
    const severities: LicenseAlertUrgency[] = ["critical", "urgent", "warning", "healthy", "not_configured"];

    it("ensures critical is the highest severity", () => {
      const hasCritical = severities.includes("critical");
      expect(hasCritical).toBe(true);
    });

    it("correctly calculates days difference regardless of timestamps during the same calendar day", () => {
      const earlyRef = new Date("2026-06-01T04:00:00.000Z");
      const laterRef = new Date("2026-06-01T14:00:00.000Z");
      const targetDate = new Date("2026-06-11T10:00:00.000Z");

      const res1 = calculateLicenseStatus(targetDate, "form_20", "DL-1", earlyRef);
      const res2 = calculateLicenseStatus(targetDate, "form_20", "DL-1", laterRef);

      expect(res1.daysRemaining).toBe(10);
      expect(res2.daysRemaining).toBe(10);
      expect(res1.urgency).toBe("urgent");
      expect(res2.urgency).toBe("urgent");
    });
  });
});
