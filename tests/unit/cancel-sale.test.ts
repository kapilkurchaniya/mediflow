import { describe, expect, it } from "vitest";
import {
  CancelSaleInputSchema,
  getIndianBusinessDate,
} from "@/server/domain/sales/cancel-sale";

describe("Cancel Sale (Unit - Task A2.4)", () => {
  describe("CancelSaleInputSchema", () => {
    it("accepts valid input with proper UUID and reason", () => {
      const valid = {
        saleId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        reason: "Customer cancelled before paying",
      };
      const parsed = CancelSaleInputSchema.parse(valid);
      expect(parsed.saleId).toBe(valid.saleId);
      expect(parsed.reason).toBe(valid.reason);
    });

    it("trims whitespace from reason", () => {
      const input = {
        saleId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        reason: "   Billing error duplicate entry   ",
      };
      const parsed = CancelSaleInputSchema.parse(input);
      expect(parsed.reason).toBe("Billing error duplicate entry");
    });

    it("rejects invalid saleId (not a UUID)", () => {
      const input = {
        saleId: "not-a-uuid",
        reason: "Valid reason",
      };
      expect(() => CancelSaleInputSchema.parse(input)).toThrow(/Invalid sale ID/i);
    });

    it("rejects reason shorter than 3 characters", () => {
      const input = {
        saleId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        reason: "no",
      };
      expect(() => CancelSaleInputSchema.parse(input)).toThrow(
        /at least 3 characters/i,
      );
    });

    it("rejects empty or whitespace-only reason", () => {
      const input = {
        saleId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        reason: "     ",
      };
      expect(() => CancelSaleInputSchema.parse(input)).toThrow(
        /at least 3 characters/i,
      );
    });

    it("rejects reason longer than 255 characters", () => {
      const input = {
        saleId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        reason: "a".repeat(256),
      };
      expect(() => CancelSaleInputSchema.parse(input)).toThrow(
        /cannot exceed 255 characters/i,
      );
    });
  });

  describe("getIndianBusinessDate", () => {
    it("formats dates into YYYY-MM-DD in Asia/Kolkata timezone", () => {
      // 2026-10-31 18:30:00 UTC is 2026-11-01 00:00:00 IST (UTC + 5:30)
      const dateUtcNight = new Date("2026-10-31T18:30:00.000Z");
      expect(getIndianBusinessDate(dateUtcNight)).toBe("2026-11-01");

      // 2026-10-31 18:29:59 UTC is 2026-10-31 23:59:59 IST
      const dateUtcBeforeMidnight = new Date("2026-10-31T18:29:59.000Z");
      expect(getIndianBusinessDate(dateUtcBeforeMidnight)).toBe("2026-10-31");
    });
  });
});
