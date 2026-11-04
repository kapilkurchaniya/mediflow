import { describe, it, expect } from "vitest";
import { calculateReconciliationDelta } from "@/server/domain/inventory/stocktake/reconcile";

describe("Movement-Aware Reconciliation Algorithm (Task A3.6)", () => {
  it("computes zero adjustment when counted matches snapshot and zero subsequent movements", () => {
    const res = calculateReconciliationDelta({
      countedQty: 10,
      systemQtyAtSnapshot: 10,
      netMovementsAfterCount: 0,
      currentQtyOnHand: 10,
      unitCostPaise: 5000,
    });

    expect(res.finalBalance).toBe(10);
    expect(res.adjustmentDelta).toBe(0);
    expect(res.varianceCostPaise).toBe(0);
  });

  it("reconciles sale that occurred BEFORE physical observation (snapshot 10, count 8, delta -2)", () => {
    // 2 units sold before counter counted, counter correctly observes 8 on shelf
    const res = calculateReconciliationDelta({
      countedQty: 8,
      systemQtyAtSnapshot: 10,
      netMovementsAfterCount: 0,
      currentQtyOnHand: 10, // live balance hadn't deducted or physical count found 2 missing
      unitCostPaise: 5000, // ₹50.00
    });

    expect(res.finalBalance).toBe(8);
    expect(res.adjustmentDelta).toBe(-2);
    expect(res.varianceCostPaise).toBe(-10000); // -₹100.00
  });

  it("prevents double-deduction when a sale occurs AFTER physical observation (F = C + M_after)", () => {
    // Shelf had 8 units physically observed at 10:00.
    // At 10:30, POS sale sold 1 unit (netMovementsAfterCount = -1).
    // Live balance at approval is now 7.
    // Final balance should be 8 + (-1) = 7. Adjustment delta should be 7 - 7 = 0!
    const res = calculateReconciliationDelta({
      countedQty: 8,
      systemQtyAtSnapshot: 10,
      netMovementsAfterCount: -1,
      currentQtyOnHand: 7,
      unitCostPaise: 5000,
    });

    expect(res.finalBalance).toBe(7);
    expect(res.adjustmentDelta).toBe(0);
    expect(res.varianceCostPaise).toBe(0);
  });

  it("correctly reconciles GRN received AFTER physical observation (F = C + M_after)", () => {
    // Shelf had 8 units physically observed at 10:00 (snapshot was 10, shortage was 2).
    // At 10:45, a GRN vendor receipt added +5 units (netMovementsAfterCount = +5).
    // Live balance is now 15 (10 + 5).
    // Final balance should be 8 + 5 = 13.
    // Adjustment delta should be 13 - 15 = -2 (correctly recognizing the 2 missing units).
    const res = calculateReconciliationDelta({
      countedQty: 8,
      systemQtyAtSnapshot: 10,
      netMovementsAfterCount: 5,
      currentQtyOnHand: 15,
      unitCostPaise: 5000,
    });

    expect(res.finalBalance).toBe(13);
    expect(res.adjustmentDelta).toBe(-2);
    expect(res.varianceCostPaise).toBe(-10000);
  });

  it("throws RECONCILIATION_ANOMALY if subsequent sales exceeded physical count", () => {
    expect(() =>
      calculateReconciliationDelta({
        countedQty: 2,
        systemQtyAtSnapshot: 5,
        netMovementsAfterCount: -5,
        currentQtyOnHand: 0,
        unitCostPaise: 2000,
      })
    ).toThrow(/results in negative balance/i);
  });

  it("handles physical surplus (count > snapshot)", () => {
    const res = calculateReconciliationDelta({
      countedQty: 15,
      systemQtyAtSnapshot: 10,
      netMovementsAfterCount: 0,
      currentQtyOnHand: 10,
      unitCostPaise: 10000, // ₹100.00
    });

    expect(res.finalBalance).toBe(15);
    expect(res.adjustmentDelta).toBe(5);
    expect(res.varianceCostPaise).toBe(50000); // +₹500.00
  });
});
