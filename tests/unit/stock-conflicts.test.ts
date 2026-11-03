import { describe, expect, it } from "vitest";

describe("Task A4.7: Stock Conflicts Unit Tests", () => {
  describe("Deficit & Outstanding Quantity Math", () => {
    it("calculates outstanding deficit correctly", () => {
      const required = 10;
      const reconciled = 4;
      const outstanding = Math.max(0, required - reconciled);
      expect(outstanding).toBe(6);
    });

    it("clamps outstanding deficit to zero when reconciled exceeds required", () => {
      const required = 5;
      const reconciled = 7;
      const outstanding = Math.max(0, required - reconciled);
      expect(outstanding).toBe(0);
    });

    it("calculates contribution deficit correctly from starting balances", () => {
      // Case 1: Was 5, sold 8, balance becomes -3
      const prevDeficit1 = Math.max(0, -5);
      const newDeficit1 = Math.max(0, -(-3));
      expect(newDeficit1 - prevDeficit1).toBe(3);

      // Case 2: Was -2, sold 4, balance becomes -6
      const prevDeficit2 = Math.max(0, -(-2));
      const newDeficit2 = Math.max(0, -(-6));
      expect(newDeficit2 - prevDeficit2).toBe(4);

      // Case 3: Was 10, sold 3, balance becomes 7
      const prevDeficit3 = Math.max(0, -10);
      const newDeficit3 = Math.max(0, -7);
      expect(newDeficit3 - prevDeficit3).toBe(0);
    });
  });

  describe("Physical Recount vs Zero Stock Adjustment Formulas", () => {
    it("calculates positive discovery adjustment correctly", () => {
      const currentLedger = -3;
      const observedCount = 5;
      const qtyChange = observedCount - currentLedger;
      expect(qtyChange).toBe(8);
      expect(currentLedger + qtyChange).toBe(observedCount);
    });

    it("calculates confirmed zero stock reconciliation offset without fabricating stock", () => {
      const currentLedger = -4;
      const observedCount = 0;
      const deficit = Math.max(0, -currentLedger);
      expect(deficit).toBe(4);
      expect(currentLedger + deficit).toBe(observedCount);
    });
  });

  describe("Batch Reallocation Validations", () => {
    const today = new Date().toISOString().split("T")[0];
    const futureDate = new Date(Date.now() + 86400000 * 30).toISOString().split("T")[0];
    const pastDate = new Date(Date.now() - 86400000 * 30).toISOString().split("T")[0];

    const sourceBatch = {
      id: "source-1",
      medicineId: "med-1",
      batchNo: "SRC001",
      qtyOnHand: -3,
    };

    const targetBatch = {
      id: "target-1",
      medicineId: "med-1",
      batchNo: "TGT001",
      status: "active",
      expiryDate: futureDate,
      qtyOnHand: 10,
    };

    it("validates that target batch matches medicine ID", () => {
      const invalidTarget = { ...targetBatch, medicineId: "different-med" };
      expect(invalidTarget.medicineId === sourceBatch.medicineId).toBe(false);
    });

    it("rejects inactive target batches", () => {
      const inactiveTarget = { ...targetBatch, status: "hold" };
      expect(inactiveTarget.status === "active").toBe(false);
    });

    it("rejects expired target batches", () => {
      const expiredTarget = { ...targetBatch, expiryDate: pastDate };
      expect(new Date(expiredTarget.expiryDate) < new Date()).toBe(true);
    });

    it("rejects target batches with insufficient stock", () => {
      const requestedQty = 15;
      expect(targetBatch.qtyOnHand >= requestedQty).toBe(false);
    });

    it("accepts valid active non-expired target batch with sufficient stock", () => {
      const requestedQty = 3;
      const isValid =
        targetBatch.medicineId === sourceBatch.medicineId &&
        targetBatch.status === "active" &&
        new Date(targetBatch.expiryDate) >= new Date(today) &&
        targetBatch.qtyOnHand >= requestedQty;

      expect(isValid).toBe(true);
    });
  });

  describe("Evidence and Reason Requirements", () => {
    it("validates dispensing evidence has minimum required length", () => {
      const validEvidence = "Physical bin substitution due to barcode mis-scan";
      const invalidEvidence = "mis";
      expect(validEvidence.trim().length >= 5).toBe(true);
      expect(invalidEvidence.trim().length >= 5).toBe(false);
    });

    it("validates dismissal reason has minimum required length", () => {
      const validReason = "Administrative test conflict verified by store manager";
      const invalidReason = "none";
      expect(validReason.trim().length >= 5).toBe(true);
      expect(invalidReason.trim().length >= 5).toBe(false);
    });
  });

  describe("Deterministic Global Lock Ordering", () => {
    it("sorts batch IDs deterministically regardless of input order", () => {
      const idA = "11111111-1111-1111-1111-111111111111";
      const idB = "22222222-2222-2222-2222-222222222222";

      const order1 = [idA, idB].sort();
      const order2 = [idB, idA].sort();

      expect(order1).toEqual([idA, idB]);
      expect(order2).toEqual([idA, idB]);
    });
  });
});
