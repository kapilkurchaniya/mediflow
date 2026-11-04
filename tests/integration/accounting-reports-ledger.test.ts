import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../setup/db";
import {
  getAccountLedgerReport,
  getPartyControlReconciliation,
  generateLedgerCsv,
} from "@/server/domain/accounting-reports";
import {
  setupAccountingReportsFixture,
  type AccountingReportsFixture,
} from "./accounting-reports-fixture";

describe("Accounting Reports — Account Ledger & Reconciliation Integration Tests", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let f: AccountingReportsFixture;

  beforeAll(async () => {
    t = await createTestDb();
    f = await setupAccountingReportsFixture(t.db);
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  describe("Continuous Running Balance & Opposing Particulars", () => {
    it("calculates continuous running balance correctly for Cash on Hand (1010)", async () => {
      const report = await getAccountLedgerReport(
        f.tenantId,
        {
          accountId: f.accounts.cash,
          dateRange: { from: "2026-11-01", to: "2026-11-04" },
          storeScope: { type: "store", storeId: f.storeA },
          limit: 10,
        },
        t.db,
      );

      expect(report.account.code).toBe("1010");
      expect(report.periodOpeningBalance).toBe(0);
      expect(report.rows.length).toBe(2); // JV-001 (Dr 10,000), JV-006 (Cr 2,000)

      // Row 1: Dr 10,000 -> Running Balance: 10,000 Dr
      expect(report.rows[0]?.entryNo).toBe("JV-001");
      expect(report.rows[0]?.debit).toBe(1000000);
      expect(report.rows[0]?.runningBalance).toBe(1000000);
      expect(report.rows[0]?.runningSide).toBe("dr");
      expect(report.rows[0]?.particulars).toContain("Sales Account");

      // Row 2: Cr 2,000 -> Running Balance: 8,000 Dr
      expect(report.rows[1]?.entryNo).toBe("JV-006");
      expect(report.rows[1]?.credit).toBe(200000);
      expect(report.rows[1]?.runningBalance).toBe(800000);
      expect(report.rows[1]?.runningSide).toBe("dr");

      // Period Closing
      expect(report.periodClosingBalance).toBe(800000);
      expect(report.periodClosingSide).toBe("dr");
    });

    it("preserves continuous running balance across keyset pagination without resetting to zero", async () => {
      // Page 1 with limit 1
      const page1 = await getAccountLedgerReport(
        f.tenantId,
        {
          accountId: f.accounts.cash,
          dateRange: { from: "2026-11-01", to: "2026-11-04" },
          storeScope: { type: "store", storeId: f.storeA },
          limit: 1,
        },
        t.db,
      );

      expect(page1.rows.length).toBe(1);
      expect(page1.rows[0]?.entryNo).toBe("JV-001");
      expect(page1.rows[0]?.runningBalance).toBe(1000000);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Page 2 using nextCursor
      const page2 = await getAccountLedgerReport(
        f.tenantId,
        {
          accountId: f.accounts.cash,
          dateRange: { from: "2026-11-01", to: "2026-11-04" },
          storeScope: { type: "store", storeId: f.storeA },
          cursor: page1.nextCursor,
          limit: 1,
        },
        t.db,
      );

      expect(page2.rows.length).toBe(1);
      expect(page2.rows[0]?.entryNo).toBe("JV-006");
      // Page opening anchor MUST equal page 1 final balance (10,000 Dr)!
      expect(page2.pageOpeningBalance).toBe(1000000);
      expect(page2.pageOpeningSide).toBe("dr");
      // Running balance after Cr 2,000 MUST be 8,000 Dr (never reset to 0)!
      expect(page2.rows[0]?.runningBalance).toBe(800000);
      expect(page2.rows[0]?.runningSide).toBe("dr");
    });

    it("correctly identifies compound entries in particulars", async () => {
      const report = await getAccountLedgerReport(
        f.tenantId,
        {
          accountId: f.accounts.debtors,
          dateRange: { from: "2026-11-01", to: "2026-11-04" },
          storeScope: { type: "store", storeId: f.storeA },
        },
        t.db,
      );

      const compoundRow = report.rows.find((r) => r.entryNo === "JV-002");
      expect(compoundRow).toBeDefined();
      expect(compoundRow?.isCompound).toBe(true);
      expect(compoundRow?.particulars).toContain("Multiple Accounts (Compound Entry)");
    });
  });

  describe("Party Subledger & Multi-Metric Reconciliation", () => {
    it("filters customer subledger strictly by partyId", async () => {
      const report = await getAccountLedgerReport(
        f.tenantId,
        {
          accountId: f.accounts.debtors,
          dateRange: { from: "2026-11-01", to: "2026-11-04" },
          storeScope: { type: "store", storeId: f.storeA },
          partyType: "customer",
          partyId: f.customerId,
        },
        t.db,
      );

      expect(report.rows.length).toBe(1);
      expect(report.rows[0]?.entryNo).toBe("JV-002");
      expect(report.periodClosingBalance).toBe(1180000);
    });

    it("diagnoses unattributed postings in Debtors Control Account (1050)", async () => {
      const recon = await getPartyControlReconciliation(
        f.tenantId,
        "customer",
        { type: "store", storeId: f.storeA },
        null,
        t.db,
      );

      expect(recon.account.code).toBe("1050");
      expect(recon.controlDebit).toBe(1180000 + 500000);
      expect(recon.subledgerDebit).toBe(1180000);
      expect(recon.unattributedDebit).toBe(500000);
      expect(recon.unattributedCount).toBe(1);
      expect(recon.unattributedPostings[0]?.entryNo).toBe("JV-003");
      expect(recon.debitVariance).toBe(0);
      expect(recon.isReconciled).toBe(false); // false because unattributed postings exist
    });
  });

  describe("Ledger CSV Export Parity", () => {
    it("exports Ledger CSV matching query balances", async () => {
      const ledgerCsv = await generateLedgerCsv(
        f.tenantId,
        {
          accountId: f.accounts.cash,
          dateRange: { from: "2026-11-01", to: "2026-11-04" },
          storeScope: { type: "store", storeId: f.storeA },
        },
        t.db,
      );

      expect(ledgerCsv).toContain("Opening Balance");
      expect(ledgerCsv).toContain("Closing Balance");
      expect(ledgerCsv).toContain("8000.00");
    });
  });
});
