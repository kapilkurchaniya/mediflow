import { describe, expect, it } from "vitest";
import { checkGoingNegative, resolveNegativeStockPolicy } from "@/lib/inventory/negative-stock-policy";
import { resolveLinePricing } from "@/lib/pricing/pricing-resolver";
import { buildUpiUri, generateQrSvg } from "@/lib/payments/upi-qr";

describe("Stage 1 Batch 2: Negative Stock Policy, Pricing/Schemes & Dynamic UPI QR", () => {
  it("resolves store/item negative stock policy and checks going-negative status", () => {
    expect(resolveNegativeStockPolicy({ storePolicy: "block", itemOverride: "inherit" })).toBe("block");
    expect(resolveNegativeStockPolicy({ storePolicy: "block", itemOverride: "allow" })).toBe("allow");

    const blocked = checkGoingNegative({ qtyOnHand: 3, requestedQty: 5, policy: "block" });
    expect(blocked.goingNegative).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(blocked.deficit).toBe(2);

    const warned = checkGoingNegative({ qtyOnHand: 3, requestedQty: 5, policy: "warn" });
    expect(warned.goingNegative).toBe(true);
    expect(warned.allowed).toBe(true);
    expect(warned.warningMessage).toContain("Going negative by 2");
  });

  it("resolves party pricing and 10+1 freeQty sale scheme", () => {
    const res = resolveLinePricing({
      mrpPaise: 10000,
      batchSaleRatePaise: 9500,
      qty: 20,
      customerDiscountBp: 500,
      scheme: {
        id: "sch-1",
        name: "10+1 Monsoon",
        schemeType: "free_qty",
        minQty: 10,
        freeQty: 1,
        discountBp: 0,
        flatDiscount: 0,
      },
    });
    expect(res.effectiveRatePaise).toBe(9500);
    expect(res.effectiveDiscountBp).toBe(500);
    expect(res.freeQty).toBe(2);
    expect(res.schemeId).toBe("sch-1");
  });

  it("builds valid NPCI UPI URI and renders scannable SVG QR", () => {
    const uri = buildUpiUri({
      vpa: "mediflow@okicici",
      payeeName: "MediFlow Pharmacy",
      amountPaise: 45250,
      txnRef: "INV-001",
    });
    expect(uri).toBe("upi://pay?pa=mediflow%40okicici&pn=MediFlow%20Pharmacy&am=452.50&cu=INR&tr=INV-001");

    const svg = generateQrSvg(uri, 160);
    expect(svg).toContain("<svg");
    expect(svg).toContain("<path");
  });
});
