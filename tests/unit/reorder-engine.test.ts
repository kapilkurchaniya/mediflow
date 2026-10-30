import { describe, it, expect } from "vitest";
import { calculateReorderQuantity } from "@/server/domain/purchasing/reorder";

describe("Reorder Suggestions Engine (calculateReorderQuantity)", () => {
  it("suggests 0 when current stock and pending orders satisfy target stock", () => {
    const result = calculateReorderQuantity({
      onHand: 50,
      onOrder: 20,
      inTransit: 10,
      avgDailySales: 2, // safetyStock = ceil(2 * (3 + 7)) = 20
      leadTimeDays: 3,
      reorderLevel: 15, // targetStock = 20 + 15 = 35
      unitsPerPack: 10,
    });

    expect(result.suggestedQty).toBe(0);
    expect(result.suggestedPacks).toBe(0);
  });

  it("calculates deficit accurately when stock is depleted and no orders pending", () => {
    const result = calculateReorderQuantity({
      onHand: 5,
      onOrder: 0,
      inTransit: 0,
      avgDailySales: 5, // safetyStock = ceil(5 * (3 + 7)) = 50
      leadTimeDays: 3,
      reorderLevel: 20, // targetStock = 50 + 20 = 70
      unitsPerPack: 10,
    });

    // Deficit = 70 - 5 = 65
    // Packs = ceil(65 / 10) = 7
    // Suggested Qty = 7 * 10 = 70
    expect(result.suggestedPacks).toBe(7);
    expect(result.suggestedQty).toBe(70);
  });

  it("rounds up to full packaging strips/boxes when pack ratio > 1", () => {
    const result = calculateReorderQuantity({
      onHand: 10,
      onOrder: 0,
      avgDailySales: 1, // safetyStock = ceil(1 * 9) = 9 (leadTime 2 default + 7)
      reorderLevel: 15, // targetStock = 9 + 15 = 24
      unitsPerPack: 10,
    });

    // Deficit = 24 - 10 = 14
    // Packs = ceil(14 / 10) = 2
    // Suggested Qty = 2 * 10 = 20
    expect(result.suggestedPacks).toBe(2);
    expect(result.suggestedQty).toBe(20);
  });

  it("respects maxStock cap when deficit would exceed ceiling", () => {
    const result = calculateReorderQuantity({
      onHand: 10,
      onOrder: 0,
      avgDailySales: 10, // safetyStock = ceil(10 * 10) = 100
      leadTimeDays: 3,
      reorderLevel: 50, // targetStock = 150
      maxStock: 80, // Cap at 80
      unitsPerPack: 10,
    });

    // Target = 150, deficit = 140
    // Max allowed = 80 - 10 = 70
    // Packs = ceil(70 / 10) = 7
    expect(result.suggestedPacks).toBe(7);
    expect(result.suggestedQty).toBe(70);
  });

  it("returns 0 if maxStock is already reached or exceeded", () => {
    const result = calculateReorderQuantity({
      onHand: 90,
      onOrder: 10,
      avgDailySales: 10,
      maxStock: 95,
      unitsPerPack: 10,
    });

    expect(result.suggestedPacks).toBe(0);
    expect(result.suggestedQty).toBe(0);
  });

  it("accounts for in-transit stock alongside on-order stock", () => {
    const result = calculateReorderQuantity({
      onHand: 10,
      onOrder: 20,
      inTransit: 25,
      avgDailySales: 4, // safetyStock = 4 * 9 = 36
      reorderLevel: 30, // targetStock = 66
      unitsPerPack: 1,
    });

    // Pipeline = 10 + 20 + 25 = 55
    // Deficit = 66 - 55 = 11
    expect(result.suggestedQty).toBe(11);
    expect(result.suggestedPacks).toBe(11);
  });

  it("falls back gracefully when optional parameters are missing or zero", () => {
    const result = calculateReorderQuantity({
      onHand: 0,
      onOrder: 0,
      avgDailySales: 0,
      unitsPerPack: 1,
    });

    // safetyStock = 0, default reorderLevel = 10, target = 10
    // Deficit = 10
    expect(result.suggestedPacks).toBe(10);
    expect(result.suggestedQty).toBe(10);
  });
});

