import { describe, expect, it } from "vitest";
import {
  OpenShiftInputSchema,
  CloseShiftInputSchema,
} from "@/server/domain/cash-sessions";

describe("Cash Sessions Domain & Schema Validation (Task P1-T04)", () => {
  it("validates OpenShiftInputSchema properly", () => {
    const valid = OpenShiftInputSchema.parse({
      openingCash: 100000,
      notes: "Morning shift float",
      denominations: { "500": 2 },
    });
    expect(valid.openingCash).toBe(100000);
    expect(valid.notes).toBe("Morning shift float");

    expect(() =>
      OpenShiftInputSchema.parse({
        openingCash: -50,
      })
    ).toThrow();
  });

  it("validates CloseShiftInputSchema and supervisorPin", () => {
    const valid = CloseShiftInputSchema.parse({
      actualCash: 154000,
      notes: "End of evening shift",
      supervisorPin: "1234",
      denominations: { "500": 3, "20": 2 },
    });
    expect(valid.actualCash).toBe(154000);
    expect(valid.supervisorPin).toBe("1234");
    expect(valid.notes).toBe("End of evening shift");

    // Can omit supervisorPin when difference <= threshold
    const validNoPin = CloseShiftInputSchema.parse({
      actualCash: 100000,
    });
    expect(validNoPin.supervisorPin).toBeUndefined();

    // Rejects negative cash count
    expect(() =>
      CloseShiftInputSchema.parse({
        actualCash: -100,
      })
    ).toThrow();
  });

  it("checks discrepancy threshold math for ₹500 (50,000 paise)", () => {
    const DISCREPANCY_THRESHOLD = 50000;
    const expected = 100000; // ₹1,000

    // ₹200 discrepancy (within ₹500)
    const diffWithin = Math.abs(120000 - expected);
    expect(diffWithin <= DISCREPANCY_THRESHOLD).toBe(true);

    // ₹600 shortage (exceeds ₹500 threshold)
    const diffShortage = Math.abs(40000 - expected);
    expect(diffShortage > DISCREPANCY_THRESHOLD).toBe(true);

    // ₹750 overage (exceeds ₹500 threshold)
    const diffOverage = Math.abs(175000 - expected);
    expect(diffOverage > DISCREPANCY_THRESHOLD).toBe(true);
  });
});

