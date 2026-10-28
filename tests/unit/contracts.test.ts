import { describe, it, expect } from "vitest";
import { SaleInput } from "@/server/domain/sales/types";
import { PostPaymentInput } from "@/server/domain/payments";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("SaleInput contract (A2.1)", () => {
  it("accepts a minimal bill and applies defaults", () => {
    const r = SaleInput.parse({ lines: [{ batchId: uuid, qty: 2, discountBp: 0 }] });
    expect(r.payments).toEqual([]);
    expect(r.billDiscountPaise).toBe(0);
    expect(r.redeemPoints).toBe(0);
  });

  it("rejects bad numbers", () => {
    const bad = (line: object) => SaleInput.safeParse({ lines: [{ batchId: uuid, qty: 1, discountBp: 0, ...line }] }).success;
    expect(bad({ qty: 0 })).toBe(false);
    expect(bad({ qty: 1.5 })).toBe(false);
    expect(bad({ discountBp: -1 })).toBe(false);
    expect(bad({ discountBp: 10001 })).toBe(false);
    expect(bad({ batchId: "nope" })).toBe(false);
  });

  it("needs at least one line and rejects non-positive payments", () => {
    expect(SaleInput.safeParse({ lines: [] }).success).toBe(false);
    expect(SaleInput.safeParse({ lines: [{ batchId: uuid, qty: 1, discountBp: 0 }], payments: [{ method: "cash", amount: 0 }] }).success).toBe(false);
    expect(SaleInput.safeParse({ lines: [{ batchId: uuid, qty: 1, discountBp: 0 }], payments: [{ method: "cheque", amount: 5 }] }).success).toBe(false);
  });
});

describe("PostPaymentInput contract (A2.9)", () => {
  const ok = { direction: "in", partyType: "customer", method: "cash", amount: 50000, paymentDate: "2026-10-29" } as const;
  it("accepts a receipt", () => expect(PostPaymentInput.safeParse(ok).success).toBe(true));
  it("rejects a bad date, method or amount", () => {
    expect(PostPaymentInput.safeParse({ ...ok, paymentDate: "29/10/2026" }).success).toBe(false);
    expect(PostPaymentInput.safeParse({ ...ok, method: "credit" }).success).toBe(false);
    expect(PostPaymentInput.safeParse({ ...ok, amount: 0 }).success).toBe(false);
  });
});
