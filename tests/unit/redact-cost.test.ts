import { describe, it, expect } from "vitest";
import { canViewCost, redactBatchCost, redactMedicineCost } from "@/server/redact";

describe("cost.view redaction (Q6 / A7.8)", () => {
  it("strips purchaseRate and purchasePrice for roles without cost.view", () => {
    const cashierCtx = { permissions: new Set(["sale.create", "inventory.view"]) } as never;
    expect(canViewCost(cashierCtx)).toBe(false);

    const batch = { id: "b1", purchaseRate: 4500, mrp: 6000 };
    expect(redactBatchCost(batch, cashierCtx).purchaseRate).toBeNull();
    expect(redactBatchCost(batch, cashierCtx).mrp).toBe(6000);

    const med = { id: "m1", purchasePrice: 4500, mrp: 6000 };
    expect(redactMedicineCost(med, cashierCtx).purchasePrice).toBeNull();
  });

  it("preserves purchaseRate and purchasePrice for roles with cost.view", () => {
    const managerCtx = { permissions: new Set(["inventory.view", "cost.view"]) } as never;
    expect(canViewCost(managerCtx)).toBe(true);

    const batch = { id: "b1", purchaseRate: 4500, mrp: 6000 };
    expect(redactBatchCost(batch, managerCtx).purchaseRate).toBe(4500);
  });
});
