import { describe, expect, it } from "vitest";
import {
  canStoreDispatchTransfers,
  canStorePerformInventoryOperations,
  canStoreReceivePurchases,
  canStoreUsePos,
  validateInvoiceSeriesConfig,
} from "@/server/domain/stores/policies";
import {
  CreateStoreInputSchema,
  DEFAULT_STORE_SETTINGS,
  StoreSettingsSchema,
  UpdateStoreInputSchema,
} from "@/server/domain/stores/types";

describe("StoreSettingsSchema", () => {
  it("validates and defaults properly", () => {
    const parsed = StoreSettingsSchema.parse({});
    expect(parsed).toEqual(DEFAULT_STORE_SETTINGS);
    expect(parsed.requireShift).toBe(false);
    expect(parsed.maxDiscountBp).toBeUndefined();
    expect(parsed.printFormat).toBe("thermal_80mm");
    expect(parsed.defaultPaymentMethod).toBe("cash");
  });

  it("accepts custom valid settings", () => {
    const parsed = StoreSettingsSchema.parse({
      requireShift: true,
      maxDiscountBp: 2500,
      printFormat: "a4",
      defaultPaymentMethod: "upi",
    });
    expect(parsed.requireShift).toBe(true);
    expect(parsed.maxDiscountBp).toBe(2500);
    expect(parsed.printFormat).toBe("a4");
    expect(parsed.defaultPaymentMethod).toBe("upi");
  });

  it("rejects negative maxDiscountBp or values exceeding 10000", () => {
    expect(() => StoreSettingsSchema.parse({ maxDiscountBp: -1 })).toThrow();
    expect(() => StoreSettingsSchema.parse({ maxDiscountBp: 10001 })).toThrow();
  });

  it("rejects non-integer maxDiscountBp", () => {
    expect(() => StoreSettingsSchema.parse({ maxDiscountBp: 15.5 })).toThrow();
  });

  it("rejects invalid print formats or payment methods", () => {
    expect(() => StoreSettingsSchema.parse({ printFormat: "dotmatrix" })).toThrow();
    expect(() => StoreSettingsSchema.parse({ defaultPaymentMethod: "bitcoin" })).toThrow();
  });
});

describe("validateInvoiceSeriesConfig (Rule 46(b) 16-char limit)", () => {
  it("allows 3-character prefixes with 6-digit sequence and 5-char FY (INV/26-27/999999 = 16 chars)", () => {
    const res = validateInvoiceSeriesConfig({ prefix: "INV", financialYear: "26-27", maxSequenceDigits: 6 });
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it("allows 1-character and 2-character prefixes", () => {
    expect(validateInvoiceSeriesConfig({ prefix: "A" }).valid).toBe(true);
    expect(validateInvoiceSeriesConfig({ prefix: "B1" }).valid).toBe(true);
  });

  it("rejects empty prefix", () => {
    const res = validateInvoiceSeriesConfig({ prefix: "" });
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/required/);
  });

  it("rejects invalid characters in prefix", () => {
    expect(validateInvoiceSeriesConfig({ prefix: "IN@V" }).valid).toBe(false);
    expect(validateInvoiceSeriesConfig({ prefix: "A B" }).valid).toBe(false);
    expect(validateInvoiceSeriesConfig({ prefix: "A%B" }).valid).toBe(false);
  });

  it("rejects prefix that would push total invoice length beyond 16 characters", () => {
    // Prefix "TOOLONG" -> TOOLONG/26-27/999999 = 20 chars
    const res = validateInvoiceSeriesConfig({ prefix: "TOOLONG", financialYear: "26-27", maxSequenceDigits: 6 });
    expect(res.valid).toBe(false);
    expect(res.error).toMatch(/exceeds the 16-character/);
  });
});

describe("Store Capability Policies", () => {
  it("canStoreUsePos: true only for active retail stores", () => {
    expect(canStoreUsePos({ kind: "retail", isActive: true })).toBe(true);
    expect(canStoreUsePos({ kind: "warehouse", isActive: true })).toBe(false);
    expect(canStoreUsePos({ kind: "retail", isActive: false })).toBe(false);
    expect(canStoreUsePos({ kind: "warehouse", isActive: false })).toBe(false);
  });

  it("canStoreReceivePurchases: true for active retail and warehouse stores", () => {
    expect(canStoreReceivePurchases({ isActive: true })).toBe(true);
    expect(canStoreReceivePurchases({ isActive: false })).toBe(false);
  });

  it("canStoreDispatchTransfers: true for active stores", () => {
    expect(canStoreDispatchTransfers({ isActive: true })).toBe(true);
    expect(canStoreDispatchTransfers({ isActive: false })).toBe(false);
  });

  it("canStorePerformInventoryOperations: true for active stores", () => {
    expect(canStorePerformInventoryOperations({ isActive: true })).toBe(true);
    expect(canStorePerformInventoryOperations({ isActive: false })).toBe(false);
  });
});

describe("CreateStoreInputSchema & UpdateStoreInputSchema", () => {
  it("normalizes code to uppercase and validates 4-char limit", () => {
    const parsed = CreateStoreInputSchema.parse({
      name: "Main Pharmacy",
      code: "blr1",
      stateCode: "29",
      invoicePrefix: "BLR",
    });
    expect(parsed.code).toBe("BLR1");
    expect(parsed.kind).toBe("retail");
  });

  it("rejects store code exceeding 4 characters", () => {
    expect(() =>
      CreateStoreInputSchema.parse({
        name: "Main Pharmacy",
        code: "BANGALORE1",
        stateCode: "29",
        invoicePrefix: "BLR",
      }),
    ).toThrow();
  });

  it("rejects invalid state code", () => {
    expect(() =>
      CreateStoreInputSchema.parse({
        name: "Main Pharmacy",
        code: "MUM1",
        stateCode: "270",
        invoicePrefix: "MUM",
      }),
    ).toThrow();
  });
});
