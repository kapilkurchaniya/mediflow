import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateSenderId,
  extractDltVariables,
  substituteDltVariables,
  isUnicodeMessage,
  calculateSmsCredits,
} from "@/lib/dlt";
import { DomainError } from "@/server/errors";
import { MockSmsProvider } from "@/server/domain/sms";

// Mock DB for DltService gatekeeper testing
const mockDbQuery = vi.fn();
vi.mock("@/server/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mockDbQuery,
        })),
      })),
    })),
  },
  schema: {
    smsTemplates: {
      tenantId: "tenant_id",
      name: "name",
      isActive: "is_active",
    },
    smsConfigs: {
      tenantId: "tenant_id",
      isActive: "is_active",
    },
  },
}));

// Import DltService after mocking db
import { DltService } from "@/server/domain/sms/dlt-service";

describe("TRAI TCCCPR 2018 DLT Compliance & Gatekeeper Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. TRAI Sender ID (Header) Validation", () => {
    it("accepts valid 6-character alphabetic Indian Sender IDs", () => {
      expect(validateSenderId("MEDFLW").valid).toBe(true);
      expect(validateSenderId("APOLLO").valid).toBe(true);
      expect(validateSenderId("TXTLCL").valid).toBe(true);
      expect(validateSenderId("medflw").valid).toBe(true);
    });

    it("rejects Sender IDs that are not exactly 6 characters", () => {
      const shortRes = validateSenderId("MED");
      expect(shortRes.valid).toBe(false);
      expect(shortRes.error).toContain("exactly 6 characters");

      const longRes = validateSenderId("MEDIFLOW");
      expect(longRes.valid).toBe(false);
      expect(longRes.error).toContain("exactly 6 characters");
    });

    it("rejects Sender IDs containing digits or special symbols", () => {
      const numRes = validateSenderId("123456");
      expect(numRes.valid).toBe(false);
      expect(numRes.error).toContain("only alphabetic letters");

      const mixRes = validateSenderId("MED123");
      expect(mixRes.valid).toBe(false);

      const symRes = validateSenderId("MED-FL");
      expect(symRes.valid).toBe(false);
    });

    it("rejects null, undefined, or empty values", () => {
      expect(validateSenderId(null).valid).toBe(false);
      expect(validateSenderId(undefined).valid).toBe(false);
      expect(validateSenderId("").valid).toBe(false);
    });
  });

  describe("2. DLT Variable Extraction & Substitution", () => {
    it("extracts standard DLT variable tags ({#var#} and {{var}})", () => {
      const body1 = "Dear {#var#}, tax invoice #{#var#} for Rs {#var#} is ready. View: {#var#}.";
      expect(extractDltVariables(body1)).toHaveLength(4);

      const body2 = "Dear {{customerName}}, your refill of {{medicine}} is due.";
      expect(extractDltVariables(body2)).toEqual(["{{customerName}}", "{{medicine}}"]);

      expect(extractDltVariables("")).toEqual([]);
    });

    it("substitutes sequential variables array into {#var#} tags", () => {
      const template = "Dear {#var#}, bill #{#var#} for Rs {#var#} at {#var#}.";
      const substituted = substituteDltVariables(template, [
        "Pawan",
        "INV-1002",
        "850",
        "MediFlow Chemist",
      ]);
      expect(substituted).toBe("Dear Pawan, bill #INV-1002 for Rs 850 at MediFlow Chemist.");
    });

    it("substitutes named key-value mappings", () => {
      const template = "Dear {{customerName}}, balance of Rs {{balance}} is due at {{pharmacy}}.";
      const substituted = substituteDltVariables(template, {
        customerName: "Rahul",
        balance: "1250",
        pharmacy: "Apollo Meds",
      });
      expect(substituted).toBe("Dear Rahul, balance of Rs 1250 is due at Apollo Meds.");
    });
  });

  describe("3. GSM 7-bit vs Unicode Encoding & Billable SMS Credits", () => {
    it("calculates 1 credit for standard GSM message <= 160 characters", () => {
      const msg = "Dear Customer, thank you for visiting MediFlow. Your order is confirmed.";
      expect(isUnicodeMessage(msg)).toBe(false);

      const creditInfo = calculateSmsCredits(msg);
      expect(creditInfo.isUnicode).toBe(false);
      expect(creditInfo.credits).toBe(1);
      expect(creditInfo.charsPerCredit).toBe(160);
      expect(creditInfo.remainingInCurrentCredit).toBe(160 - msg.length);
    });

    it("calculates multi-part credits (153 chars/segment) for GSM messages > 160 chars", () => {
      // 161 characters message
      const msg = "A".repeat(161);
      const creditInfo = calculateSmsCredits(msg);
      expect(creditInfo.isUnicode).toBe(false);
      expect(creditInfo.credits).toBe(2);
      expect(creditInfo.charsPerCredit).toBe(153);
      expect(creditInfo.remainingInCurrentCredit).toBe(306 - 161);

      // 310 characters message -> ceil(310 / 153) = 3 credits
      const longMsg = "B".repeat(310);
      const longInfo = calculateSmsCredits(longMsg);
      expect(longInfo.credits).toBe(3);
    });

    it("detects Hindi/Devanagari characters and switches to UCS-2 Unicode limits", () => {
      const hindiMsg = "प्रिय ग्राहक, आपका बिल तैयार है। मेडिफ्लो में खरीदारी के लिए धन्यवाद।";
      expect(isUnicodeMessage(hindiMsg)).toBe(true);

      const info = calculateSmsCredits(hindiMsg);
      expect(info.isUnicode).toBe(true);
      expect(info.credits).toBe(1);
      expect(info.charsPerCredit).toBe(70);
    });

    it("calculates multi-part credits (67 chars/segment) for Unicode messages > 70 chars", () => {
      // Hindi string of 75 characters
      const unicode75 = "नमस्ते ".repeat(12).slice(0, 75);
      expect(unicode75.length).toBe(75);
      const info = calculateSmsCredits(unicode75);
      expect(info.isUnicode).toBe(true);
      expect(info.credits).toBe(2);
      expect(info.charsPerCredit).toBe(67);
      expect(info.remainingInCurrentCredit).toBe(134 - 75);
    });
  });

  describe("4. DltService Mandatory Pre-Send Gatekeeper", () => {
    it("STRICTLY BLOCKS dispatch with DLT_TEMPLATE_REQUIRED when template is not in database", async () => {
      mockDbQuery.mockResolvedValueOnce([]); // No template found

      await expect(
        DltService.sendTemplateSms({
          tenantId: "tenant_test",
          to: "9876543210",
          templateName: "unregistered_promo_blast",
          variables: ["Pawan"],
        })
      ).rejects.toThrowError(DomainError);

      mockDbQuery.mockResolvedValueOnce([]);
      try {
        await DltService.sendTemplateSms({
          tenantId: "tenant_test",
          to: "9876543210",
          templateName: "unregistered_promo_blast",
          variables: ["Pawan"],
        });
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(DomainError);
        expect((err as DomainError).code).toBe("DLT_TEMPLATE_REQUIRED");
      }
    });

    it("STRICTLY BLOCKS dispatch when template exists but dltTemplateId is empty or blank", async () => {
      mockDbQuery.mockResolvedValueOnce([
        {
          id: "tmpl_1",
          tenantId: "tenant_test",
          name: "invoice_receipt",
          senderId: "MEDFLW",
          dltTemplateId: "", // Blank DLT ID
          body: "Dear {#var#}, bill #{#var#}",
          isActive: true,
        },
      ]);

      await expect(
        DltService.sendTemplateSms({
          tenantId: "tenant_test",
          to: "9876543210",
          templateName: "invoice_receipt",
          variables: ["Pawan", "INV-101"],
        })
      ).rejects.toThrow(DomainError);
    });

    it("BLOCKS dispatch with INVALID_SENDER_ID when Sender ID is not a 6-alpha header", async () => {
      mockDbQuery.mockResolvedValueOnce([
        {
          id: "tmpl_2",
          tenantId: "tenant_test",
          name: "invalid_sender_tmpl",
          senderId: "12345", // Invalid header
          dltTemplateId: "1107161234567890123",
          body: "Dear {#var#}, bill #{#var#}",
          isActive: true,
        },
      ]);

      try {
        await DltService.sendTemplateSms({
          tenantId: "tenant_test",
          to: "9876543210",
          templateName: "invalid_sender_tmpl",
          variables: ["Pawan", "INV-101"],
        });
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(DomainError);
        expect((err as DomainError).code).toBe("INVALID_SENDER_ID");
      }
    });

    it("successfully compiles variables and dispatches via provider when DLT compliant", async () => {
      // 1. Template query returns approved template
      mockDbQuery.mockResolvedValueOnce([
        {
          id: "tmpl_3",
          tenantId: "tenant_test",
          name: "invoice_receipt",
          senderId: "MEDFLW",
          dltTemplateId: "1107161234567890123",
          entityId: "1101123456789012345",
          body: "Dear {#var#}, invoice #{#var#} of Rs {#var#} is ready. MediFlow",
          isActive: true,
        },
      ]);

      // 2. SmsConfig query (in getSmsProvider) returns empty -> falls back to MockSmsProvider
      mockDbQuery.mockResolvedValueOnce([]);

      const result = await DltService.sendTemplateSms({
        tenantId: "tenant_test",
        to: "9876543210",
        templateName: "invoice_receipt",
        variables: ["Pawan", "INV-999", "1450"],
      });

      expect(result.success).toBe(true);
      expect(result.provider).toBe("simulator");
      expect(result.messageId).toContain("mock_sms_");
    });
  });

  describe("5. SmsProvider backward-compatibility and DLT payloads", () => {
    it("MockSmsProvider supports both signature styles without throwing", async () => {
      const provider = new MockSmsProvider();

      // Legacy signature (to, message)
      const res1 = await provider.sendSms("9876543210", "Legacy notification");
      expect(res1.success).toBe(true);

      // Modern DLT params object
      const res2 = await provider.sendSms({
        to: "9876543210",
        message: "DLT compliant notification",
        dltTemplateId: "1107161234567890123",
        senderId: "MEDFLW",
      });
      expect(res2.success).toBe(true);
    });
  });
});
