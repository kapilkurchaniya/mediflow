import { describe, expect, it } from "vitest";
import {
  getNormalBalanceSide,
  computeBalanceValueAndSide,
  sanitizeCsvCell,
  formatPaiseDecimal,
  resolveStoreScope,
} from "@/server/domain/accounting-reports";
import type { AuthCtx } from "@/server/rbac";

describe("Accounting Reports Unit Tests", () => {
  describe("getNormalBalanceSide", () => {
    it("correctly identifies normal debit accounts (asset and expense)", () => {
      expect(getNormalBalanceSide("asset")).toBe("dr");
      expect(getNormalBalanceSide("expense")).toBe("dr");
    });

    it("correctly identifies normal credit accounts (liability, equity, income)", () => {
      expect(getNormalBalanceSide("liability")).toBe("cr");
      expect(getNormalBalanceSide("equity")).toBe("cr");
      expect(getNormalBalanceSide("income")).toBe("cr");
    });
  });

  describe("computeBalanceValueAndSide", () => {
    it("calculates positive asset/expense balance as debit", () => {
      const res = computeBalanceValueAndSide(10000, 3000, "dr");
      expect(res.balance).toBe(7000);
      expect(res.side).toBe("dr");
    });

    it("calculates negative asset/expense balance as overdrawn credit", () => {
      const res = computeBalanceValueAndSide(2000, 5000, "dr");
      expect(res.balance).toBe(3000);
      expect(res.side).toBe("cr");
    });

    it("calculates positive liability/income balance as credit", () => {
      const res = computeBalanceValueAndSide(1000, 6000, "cr");
      expect(res.balance).toBe(5000);
      expect(res.side).toBe("cr");
    });

    it("calculates negative liability/income balance as debit advance", () => {
      const res = computeBalanceValueAndSide(7000, 2000, "cr");
      expect(res.balance).toBe(5000);
      expect(res.side).toBe("dr");
    });

    it("handles zero net balance gracefully", () => {
      const drRes = computeBalanceValueAndSide(4000, 4000, "dr");
      expect(drRes.balance).toBe(0);
      expect(drRes.side).toBe("dr");

      const crRes = computeBalanceValueAndSide(4000, 4000, "cr");
      expect(crRes.balance).toBe(0);
      expect(crRes.side).toBe("cr");
    });
  });

  describe("sanitizeCsvCell (Formula Injection Protection)", () => {
    it("escapes cells starting with formula trigger characters", () => {
      expect(sanitizeCsvCell("=SUM(A1:A10)")).toBe("'=SUM(A1:A10)");
      expect(sanitizeCsvCell("+12345")).toBe("'+12345");
      expect(sanitizeCsvCell("-cmd|' /C calc'!A0")).toBe("'-cmd|' /C calc'!A0");
      expect(sanitizeCsvCell("@alert")).toBe("'@alert");
      expect(sanitizeCsvCell("@SUM(1,2)")).toBe('"\'@SUM(1,2)"');
      expect(sanitizeCsvCell("\tTAB")).toBe("'\tTAB");
      expect(sanitizeCsvCell("\rRETURN")).toBe('"\'\rRETURN"');
    });

    it("leaves safe text and numbers intact without prepending quote", () => {
      expect(sanitizeCsvCell("Sales Account")).toBe("Sales Account");
      expect(sanitizeCsvCell("Cash on Hand")).toBe("Cash on Hand");
      expect(sanitizeCsvCell(125000)).toBe("125000");
    });

    it("escapes cells with internal commas and quotes per RFC-4180", () => {
      expect(sanitizeCsvCell('Rent, Utilities "Office"')).toBe('"Rent, Utilities ""Office"""');
    });

    it("handles null and undefined values safely", () => {
      expect(sanitizeCsvCell(null)).toBe("");
      expect(sanitizeCsvCell(undefined)).toBe("");
    });
  });

  describe("formatPaiseDecimal", () => {
    it("converts integer paise into two-decimal string without scientific notation", () => {
      expect(formatPaiseDecimal(100)).toBe("1.00");
      expect(formatPaiseDecimal(123456)).toBe("1234.56");
      expect(formatPaiseDecimal(0)).toBe("0.00");
      expect(formatPaiseDecimal(5)).toBe("0.05");
    });
  });

  describe("resolveStoreScope", () => {
    const storeA = "11111111-1111-1111-1111-111111111111";
    const storeB = "22222222-2222-2222-2222-222222222222";

    const baseCtx: AuthCtx = {
      tenantId: "tenant-1",
      storeId: storeA,
      allowedStoreIds: [storeA],
      permissions: new Set(["accounting.view"]),
      userId: "user-1",
      user: { id: "user-1", name: "User 1", email: "user1@example.com", pharmacistRegNo: null },
    };

    it("locks store-scoped user to assigned storeId", () => {
      const scope = resolveStoreScope(baseCtx, { type: "all" });
      expect(scope).toEqual({ type: "store", storeId: storeA });
    });

    it("rejects unauthorized store access attempt", () => {
      expect(() => {
        resolveStoreScope(baseCtx, { type: "store", storeId: storeB });
      }).toThrow(/Unauthorized store access/);
    });

    it("allows consolidated all-stores reporting for users with report.all_stores", () => {
      const allCtx: AuthCtx = {
        ...baseCtx,
        permissions: new Set(["accounting.view", "report.all_stores"]),
      };
      const scope = resolveStoreScope(allCtx, { type: "all" });
      expect(scope).toEqual({ type: "all" });
    });

    it("allows unallocated tenant-wide scope for users with report.all_stores", () => {
      const allCtx: AuthCtx = {
        ...baseCtx,
        permissions: new Set(["accounting.view", "report.all_stores"]),
      };
      const scope = resolveStoreScope(allCtx, { type: "unallocated" });
      expect(scope).toEqual({ type: "unallocated" });
    });
  });
});
