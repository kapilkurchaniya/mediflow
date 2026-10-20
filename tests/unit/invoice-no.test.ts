import { describe, expect, it } from "vitest";
import { INVOICE_NO_SUFFIX_LENGTH, MAX_INVOICE_PREFIX_LENGTH, validateInvoicePrefix } from "@/lib/invoice-no";
import { MAX_INVOICE_NO_LENGTH } from "@/lib/regulatory";

describe("validateInvoicePrefix", () => {
  it("allows up to 3 capital letters/digits, which is what fits in 16 characters", () => {
    expect(MAX_INVOICE_PREFIX_LENGTH).toBe(3);
    for (const ok of ["INV", "MED", "A", "B2"]) expect(validateInvoicePrefix(ok)).toBeNull();
  });

  it("the longest allowed prefix produces exactly a 16-character invoice number", () => {
    expect("X".repeat(MAX_INVOICE_PREFIX_LENGTH).length + INVOICE_NO_SUFFIX_LENGTH).toBe(MAX_INVOICE_NO_LENGTH);
  });

  it("rejects longer prefixes with an explanation", () => {
    expect(validateInvoicePrefix("BILL")).toMatch(/at most 3/);
  });

  it("rejects characters that would break the number's structure", () => {
    for (const bad of ["", "in", "A/B", "A-B", "A B"]) expect(validateInvoicePrefix(bad)).not.toBeNull();
  });
});
