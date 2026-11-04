import { describe, expect, it, beforeAll } from "vitest";
import {
  getDayBookReport,
  generateDayBookCsv,
} from "@/server/domain/accounting-reports";
import {
  setupAccountingReportsFixture,
  type AccountingReportsFixture,
} from "./accounting-reports-fixture";

describe("Accounting Reports — Day Book Integration Tests", () => {
  let f: AccountingReportsFixture;

  beforeAll(async () => {
    f = await setupAccountingReportsFixture();
  });

  it("reports exactly Store A transactions with balanced Dr == Cr", async () => {
    const report = await getDayBookReport(f.tenantId, {
      dateRange: { from: "2026-11-01", to: "2026-11-04" },
      storeScope: { type: "store", storeId: f.storeA },
    });

    expect(report.totalVouchers).toBe(4); // JV-001, JV-002, JV-003, JV-006
    expect(report.isBalanced).toBe(true);
    expect(report.totalDebit).toBe(report.totalCredit);
    expect(report.totalDebit).toBe(1000000 + 1180000 + 500000 + 200000);
  });

  it("filters accurately by voucher type including sale_return", async () => {
    const report = await getDayBookReport(f.tenantId, {
      dateRange: { from: "2026-11-01", to: "2026-11-04" },
      storeScope: { type: "store", storeId: f.storeA },
      voucherType: "sale_return",
    });

    expect(report.totalVouchers).toBe(1);
    expect(report.entries[0]?.entryNo).toBe("JV-006");
    expect(report.entries[0]?.refType).toBe("sale_return");
  });

  it("consolidated all-stores report includes Store A, Store B, and unallocated tenant-wide entry exactly once", async () => {
    const allReport = await getDayBookReport(f.tenantId, {
      dateRange: { from: "2026-11-01", to: "2026-11-04" },
      storeScope: { type: "all" },
    });

    expect(allReport.totalVouchers).toBe(6);
    expect(allReport.isBalanced).toBe(true);

    const unallocatedReport = await getDayBookReport(f.tenantId, {
      dateRange: { from: "2026-11-01", to: "2026-11-04" },
      storeScope: { type: "unallocated" },
    });
    expect(unallocatedReport.totalVouchers).toBe(1);
    expect(unallocatedReport.entries[0]?.entryNo).toBe("JV-005");
  });

  it("exports Day Book CSV matching query totals and vouchers", async () => {
    const dayBookCsv = await generateDayBookCsv(f.tenantId, {
      dateRange: { from: "2026-11-01", to: "2026-11-04" },
      storeScope: { type: "store", storeId: f.storeA },
    });

    expect(dayBookCsv).toContain("JV-001");
    expect(dayBookCsv).toContain("JV-002");
    expect(dayBookCsv).toContain("Cash sale to counter walk-in");
    expect(dayBookCsv).toContain("TOTALS");
  });
});
