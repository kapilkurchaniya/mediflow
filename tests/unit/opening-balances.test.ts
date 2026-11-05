import { describe, it, expect } from "vitest";
import {
  computeCanonicalPayloadHash,
  customerOpeningSchema,
  supplierOpeningSchema,
  inventorySnapshotSchema,
  glOpeningSchema,
  reclassifyEquitySchema,
} from "@/server/domain/accounting-opening-balances";

describe("Opening Balances Unit Tests", () => {
  describe("computeCanonicalPayloadHash", () => {
    it("produces identical hashes regardless of object key order", () => {
      const hash1 = computeCanonicalPayloadHash({
        tenantId: "t-1",
        storeId: "s-1",
        entityType: "customer",
        entityId: "c-1",
        asOfDate: "2026-04-01",
        amountPaise: 50000,
      });

      const hash2 = computeCanonicalPayloadHash({
        amountPaise: 50000,
        asOfDate: "2026-04-01",
        entityId: "c-1",
        entityType: "customer",
        storeId: "s-1",
        tenantId: "t-1",
      });

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it("normalizes string trimming", () => {
      const hash1 = computeCanonicalPayloadHash({
        tenantId: "t-1",
        asOfDate: "2026-04-01",
        entityId: "c-1",
      });

      const hash2 = computeCanonicalPayloadHash({
        tenantId: "  t-1  ",
        asOfDate: "2026-04-01",
        entityId: "c-1 ",
      });

      expect(hash1).toBe(hash2);
    });

    it("produces different hashes when amount or date changes", () => {
      const base = {
        tenantId: "t-1",
        storeId: "s-1",
        entityType: "customer",
        entityId: "c-1",
        asOfDate: "2026-04-01",
        amountPaise: 50000,
      };

      const hash1 = computeCanonicalPayloadHash(base);
      const hashDiffAmount = computeCanonicalPayloadHash({ ...base, amountPaise: 50001 });
      const hashDiffDate = computeCanonicalPayloadHash({ ...base, asOfDate: "2026-04-02" });

      expect(hash1).not.toBe(hashDiffAmount);
      expect(hash1).not.toBe(hashDiffDate);
    });
  });

  describe("Validation Schemas", () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";

    it("customerOpeningSchema validates positive and negative balances, rejects 0", () => {
      expect(
        customerOpeningSchema.safeParse({
          customerId: validUuid,
          amountPaise: 25000,
          asOfDate: "2026-04-01",
        }).success
      ).toBe(true);

      expect(
        customerOpeningSchema.safeParse({
          customerId: validUuid,
          amountPaise: -15000,
          asOfDate: "2026-04-01",
        }).success
      ).toBe(true);

      // Rejects 0
      const zeroRes = customerOpeningSchema.safeParse({
        customerId: validUuid,
        amountPaise: 0,
        asOfDate: "2026-04-01",
      });
      expect(zeroRes.success).toBe(false);

      // Rejects invalid date
      const badDate = customerOpeningSchema.safeParse({
        customerId: validUuid,
        amountPaise: 1000,
        asOfDate: "01-04-2026",
      });
      expect(badDate.success).toBe(false);
    });

    it("supplierOpeningSchema validates balances and rejects 0", () => {
      expect(
        supplierOpeningSchema.safeParse({
          supplierId: validUuid,
          amountPaise: 400000,
          asOfDate: "2026-04-01",
        }).success
      ).toBe(true);

      expect(
        supplierOpeningSchema.safeParse({
          supplierId: validUuid,
          amountPaise: 0,
          asOfDate: "2026-04-01",
        }).success
      ).toBe(false);
    });

    it("inventorySnapshotSchema requires valid UUID and date format", () => {
      expect(
        inventorySnapshotSchema.safeParse({
          storeId: validUuid,
          asOfDate: "2026-04-01",
        }).success
      ).toBe(true);

      expect(
        inventorySnapshotSchema.safeParse({
          storeId: "not-a-uuid",
          asOfDate: "2026-04-01",
        }).success
      ).toBe(false);
    });

    it("glOpeningSchema enforces positive amount and narration", () => {
      expect(
        glOpeningSchema.safeParse({
          accountId: validUuid,
          direction: "debit",
          amountPaise: 100000,
          asOfDate: "2026-04-01",
          narration: "Cash on hand float",
        }).success
      ).toBe(true);

      expect(
        glOpeningSchema.safeParse({
          accountId: validUuid,
          direction: "debit",
          amountPaise: -500,
          asOfDate: "2026-04-01",
          narration: "Negative test",
        }).success
      ).toBe(false);
    });

    it("reclassifyEquitySchema requires reason and date", () => {
      expect(
        reclassifyEquitySchema.safeParse({
          targetAccountId: validUuid,
          entryDate: "2026-04-01",
          reason: "FY 2026-27 opening equity transfer to Owner Capital",
        }).success
      ).toBe(true);

      expect(
        reclassifyEquitySchema.safeParse({
          targetAccountId: validUuid,
          entryDate: "2026-04-01",
          reason: "tiny",
        }).success
      ).toBe(false);
    });
  });
});
