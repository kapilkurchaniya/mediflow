import { describe, it, expect } from "vitest";
import { evaluateLinePriceGuard } from "@/lib/pricing/price-guard";

describe("evaluateLinePriceGuard (Q7 / A5)", () => {
  it("always blocks sales above printed MRP", () => {
    const res = evaluateLinePriceGuard({
      medicineName: "Dolo 650",
      saleRatePaise: 3600,
      discountBp: 0,
      mrpPaise: 3400,
      costPaise: 2400,
      belowCostPolicy: "off",
    });
    expect(res.aboveMrp).toBe(true);
    expect(res.blocked).toBe(true);
    expect(res.reason).toContain("exceeds printed MRP");
  });

  it("applies belowCostPolicy (off | warn | block) after discount", () => {
    const offRes = evaluateLinePriceGuard({
      medicineName: "Pan 40",
      saleRatePaise: 10000,
      discountBp: 3000, // net 7000 < cost 8000
      mrpPaise: 12000,
      costPaise: 8000,
      belowCostPolicy: "off",
    });
    expect(offRes.belowCost).toBe(true);
    expect(offRes.blocked).toBe(false);
    expect(offRes.reason).toBeUndefined();

    const warnRes = evaluateLinePriceGuard({
      medicineName: "Pan 40",
      saleRatePaise: 10000,
      discountBp: 3000,
      mrpPaise: 12000,
      costPaise: 8000,
      belowCostPolicy: "warn",
    });
    expect(warnRes.belowCost).toBe(true);
    expect(warnRes.blocked).toBe(false);
    expect(warnRes.reason).toContain("below purchase cost");

    const blockRes = evaluateLinePriceGuard({
      medicineName: "Pan 40",
      saleRatePaise: 10000,
      discountBp: 3000,
      mrpPaise: 12000,
      costPaise: 8000,
      belowCostPolicy: "block",
    });
    expect(blockRes.belowCost).toBe(true);
    expect(blockRes.blocked).toBe(true);
  });
});
