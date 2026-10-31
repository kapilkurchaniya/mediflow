import { describe, it, expect } from "vitest";
import { computeFefoPreview, isFefoOverride, isFefoEarlier, FEFO_OVERRIDE_REASONS } from "@/lib/fefo";

describe("FEFO Utilities", () => {
  describe("isFefoEarlier", () => {
    it("orders by expiryDate when expiry dates differ", () => {
      const a = { id: "z", expiryDate: "2026-06-01" };
      const b = { id: "a", expiryDate: "2026-12-01" };
      expect(isFefoEarlier(a, b)).toBe(true);
      expect(isFefoEarlier(b, a)).toBe(false);
    });

    it("orders by createdAt when expiry dates are identical", () => {
      const a = { id: "z", expiryDate: "2027-01-01", createdAt: "2026-01-01T00:00:00.000Z" };
      const b = { id: "a", expiryDate: "2027-01-01", createdAt: "2026-02-01T00:00:00.000Z" };
      expect(isFefoEarlier(a, b)).toBe(true);
      expect(isFefoEarlier(b, a)).toBe(false);
    });

    it("orders by id when both expiryDate and createdAt are identical", () => {
      const a = { id: "BATCH-A", expiryDate: "2027-01-01", createdAt: "2026-01-01T00:00:00.000Z" };
      const b = { id: "BATCH-B", expiryDate: "2027-01-01", createdAt: "2026-01-01T00:00:00.000Z" };
      expect(isFefoEarlier(a, b)).toBe(true);
      expect(isFefoEarlier(b, a)).toBe(false);
    });
  });

  describe("computeFefoPreview", () => {
    it("allocates entirely from single earliest batch when stock is sufficient", () => {
      const batches = [
        { id: "b2", batchNo: "BATCH-2", expiryDate: "2027-01-01", qtyOnHand: 20 },
        { id: "b1", batchNo: "BATCH-1", expiryDate: "2026-06-01", qtyOnHand: 15 },
      ];

      const res = computeFefoPreview(batches, 10, "2026-01-01");
      expect(res.isSplit).toBe(false);
      expect(res.hasShortage).toBe(false);
      expect(res.totalAvailable).toBe(35);
      expect(res.slices).toEqual([
        { batchId: "b1", batchNo: "BATCH-1", expiryDate: "2026-06-01", qty: 10 },
      ]);
      expect(res.summaryText).toBe("10 from BATCH-1");
    });

    it("splits greedily across multiple batches in expiry order", () => {
      const batches = [
        { id: "b3", batchNo: "BATCH-3", expiryDate: "2027-06-01", qtyOnHand: 20 },
        { id: "b1", batchNo: "BATCH-1", expiryDate: "2026-06-01", qtyOnHand: 10 },
        { id: "b2", batchNo: "BATCH-2", expiryDate: "2026-12-01", qtyOnHand: 8 },
      ];

      const res = computeFefoPreview(batches, 15, "2026-01-01");
      expect(res.isSplit).toBe(true);
      expect(res.hasShortage).toBe(false);
      expect(res.totalAvailable).toBe(38);
      expect(res.slices).toEqual([
        { batchId: "b1", batchNo: "BATCH-1", expiryDate: "2026-06-01", qty: 10 },
        { batchId: "b2", batchNo: "BATCH-2", expiryDate: "2026-12-01", qty: 5 },
      ]);
      expect(res.summaryText).toBe("10 from BATCH-1 + 5 from BATCH-2");
    });

    it("detects shortage when requested quantity exceeds total eligible stock", () => {
      const batches = [
        { id: "b1", batchNo: "BATCH-1", expiryDate: "2026-06-01", qtyOnHand: 10 },
      ];

      const res = computeFefoPreview(batches, 15, "2026-01-01");
      expect(res.hasShortage).toBe(true);
      expect(res.totalAvailable).toBe(10);
      expect(res.slices).toEqual([
        { batchId: "b1", batchNo: "BATCH-1", expiryDate: "2026-06-01", qty: 10 },
      ]);
    });

    it("ignores expired batches and zero-stock batches", () => {
      const batches = [
        { id: "b-exp", batchNo: "EXP-1", expiryDate: "2025-12-31", qtyOnHand: 50 },
        { id: "b-zero", batchNo: "ZERO-1", expiryDate: "2026-08-01", qtyOnHand: 0 },
        { id: "b-valid", batchNo: "VALID-1", expiryDate: "2026-10-01", qtyOnHand: 12 },
      ];

      const res = computeFefoPreview(batches, 5, "2026-01-01");
      expect(res.totalAvailable).toBe(12);
      expect(res.slices).toEqual([
        { batchId: "b-valid", batchNo: "VALID-1", expiryDate: "2026-10-01", qty: 5 },
      ]);
    });

    it("deterministically tie-breaks batches with identical expiry date", () => {
      const batches = [
        { id: "b2", batchNo: "BATCH-2", expiryDate: "2026-12-01", qtyOnHand: 10, createdAt: "2026-02-01" },
        { id: "b1", batchNo: "BATCH-1", expiryDate: "2026-12-01", qtyOnHand: 10, createdAt: "2026-01-01" },
      ];

      const res = computeFefoPreview(batches, 5, "2026-01-01");
      expect(res.slices[0].batchId).toBe("b1");
    });

    it("handles zero, negative, or invalid requested quantities gracefully", () => {
      const batches = [
        { id: "b1", batchNo: "BATCH-1", expiryDate: "2026-12-01", qtyOnHand: 10 },
      ];

      const zeroRes = computeFefoPreview(batches, 0, "2026-01-01");
      expect(zeroRes.slices).toHaveLength(0);
      expect(zeroRes.hasShortage).toBe(false);

      const negRes = computeFefoPreview(batches, -5, "2026-01-01");
      expect(negRes.slices).toHaveLength(0);
      expect(negRes.hasShortage).toBe(false);
    });
  });

  describe("isFefoOverride", () => {
    const batches = [
      { id: "b1", batchNo: "BATCH-1", expiryDate: "2026-05-01", qtyOnHand: 10, status: "active" },
      { id: "b2", batchNo: "BATCH-2", expiryDate: "2026-10-01", qtyOnHand: 15, status: "active" },
      { id: "b3", batchNo: "BATCH-3", expiryDate: "2027-01-01", qtyOnHand: 20, status: "active" },
    ];

    it("returns false when selecting the earliest active batch with stock", () => {
      const res = isFefoOverride(batches[0], batches, "2026-01-01");
      expect(res.isOverride).toBe(false);
      expect(res.skippedBatches).toHaveLength(0);
    });

    it("returns true and reports skipped batches when selecting a later batch", () => {
      const res = isFefoOverride(batches[2], batches, "2026-01-01");
      expect(res.isOverride).toBe(true);
      expect(res.skippedBatches.map((b) => b.id)).toEqual(["b1", "b2"]);
    });

    it("returns false if earlier batches have zero stock", () => {
      const batchesWithZeroStock = [
        { id: "b1", batchNo: "BATCH-1", expiryDate: "2026-05-01", qtyOnHand: 0, status: "active" },
        { id: "b2", batchNo: "BATCH-2", expiryDate: "2026-10-01", qtyOnHand: 15, status: "active" },
      ];

      const res = isFefoOverride(batchesWithZeroStock[1], batchesWithZeroStock, "2026-01-01");
      expect(res.isOverride).toBe(false);
      expect(res.skippedBatches).toHaveLength(0);
    });

    it("returns false if earlier batches are already expired", () => {
      const batchesWithExpired = [
        { id: "b1", batchNo: "BATCH-1", expiryDate: "2025-12-01", qtyOnHand: 10, status: "active" },
        { id: "b2", batchNo: "BATCH-2", expiryDate: "2026-10-01", qtyOnHand: 15, status: "active" },
      ];

      const res = isFefoOverride(batchesWithExpired[1], batchesWithExpired, "2026-01-01");
      expect(res.isOverride).toBe(false);
      expect(res.skippedBatches).toHaveLength(0);
    });

    it("detects override between batches with identical expiry date using createdAt", () => {
      const sameExpiryBatches = [
        { id: "b-earlier", batchNo: "SAME-1", expiryDate: "2027-01-01", qtyOnHand: 10, status: "active", createdAt: "2026-01-01T00:00:00Z" },
        { id: "b-later", batchNo: "SAME-2", expiryDate: "2027-01-01", qtyOnHand: 10, status: "active", createdAt: "2026-02-01T00:00:00Z" },
      ];

      // Selecting b-later skips b-earlier
      const laterRes = isFefoOverride(sameExpiryBatches[1], sameExpiryBatches, "2026-01-01");
      expect(laterRes.isOverride).toBe(true);
      expect(laterRes.skippedBatches).toHaveLength(1);
      expect(laterRes.skippedBatches[0].id).toBe("b-earlier");

      // Selecting b-earlier does NOT skip any batch
      const earlierRes = isFefoOverride(sameExpiryBatches[0], sameExpiryBatches, "2026-01-01");
      expect(earlierRes.isOverride).toBe(false);
      expect(earlierRes.skippedBatches).toHaveLength(0);
    });
  });

  describe("FEFO_OVERRIDE_REASONS", () => {
    it("contains standardized compliance reason codes", () => {
      const codes = FEFO_OVERRIDE_REASONS.map((r) => r.code);
      expect(codes).toContain("CUSTOMER_REQUEST");
      expect(codes).toContain("SHELF_DISCREPANCY");
      expect(codes).toContain("PACKAGING_DAMAGED");
      expect(codes).toContain("NEAR_EXPIRY_REJECTED");
      expect(codes).toContain("STOCK_COUNT_ERROR");
      expect(codes).toContain("OTHER");
    });
  });
});
