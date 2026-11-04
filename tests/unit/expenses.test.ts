import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNTS } from "@/server/domain/accounting";
import { RecordExpenseInputSchema } from "@/server/domain/expenses/types";

describe("Task A5.1 - Expenses Unit Tests", () => {
  it("contains all standard operational expense accounts in DEFAULT_ACCOUNTS", () => {
    const codes = DEFAULT_ACCOUNTS.map((a) => a.code);
    expect(codes).toContain("4110"); // Rent
    expect(codes).toContain("4120"); // Salary
    expect(codes).toContain("4130"); // Utilities
    expect(codes).toContain("4140"); // Transport
    expect(codes).toContain("4145"); // Stationery
    expect(codes).toContain("4150"); // Misc
    expect(codes).toContain("4155"); // Maintenance

    const rent = DEFAULT_ACCOUNTS.find((a) => a.code === "4110");
    expect(rent?.type).toBe("expense");
    expect(rent?.systemKey).toBe("expense_rent");
  });

  it("validates safe integer paise and rejects negative or floating amounts", () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    const validPayload = {
      clientOperationId: validUuid,
      expenseAccountId: validUuid,
      amount: 150000, // ₹1,500.00
      method: "cash" as const,
      paidFromTill: true,
      paymentDate: "2026-11-04",
      payeeName: "Best Landlord",
    };

    expect(RecordExpenseInputSchema.safeParse(validPayload).success).toBe(true);

    // Negative amount
    expect(RecordExpenseInputSchema.safeParse({ ...validPayload, amount: -500 }).success).toBe(false);

    // Zero amount
    expect(RecordExpenseInputSchema.safeParse({ ...validPayload, amount: 0 }).success).toBe(false);

    // Floating amount
    expect(RecordExpenseInputSchema.safeParse({ ...validPayload, amount: 123.45 }).success).toBe(false);

    // Invalid date format
    expect(RecordExpenseInputSchema.safeParse({ ...validPayload, paymentDate: "04-11-2026" }).success).toBe(false);
  });

  it("supports structured vendor metadata in validation schema", () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";
    const parsed = RecordExpenseInputSchema.parse({
      clientOperationId: validUuid,
      expenseAccountId: validUuid,
      amount: 50000,
      method: "bank",
      paidFromTill: false,
      paymentDate: "2026-11-04",
      payeeName: "Tata Power",
      vendorInvoiceNo: "INV-2026-1024",
      vendorInvoiceDate: "2026-11-01",
      vendorGstin: "27AAAAA0000A1Z5",
      reference: "NEFT987654321",
      note: "Monthly electric bill",
    });

    expect(parsed.vendorInvoiceNo).toBe("INV-2026-1024");
    expect(parsed.vendorGstin).toBe("27AAAAA0000A1Z5");
    expect(parsed.paidFromTill).toBe(false);
  });
});
