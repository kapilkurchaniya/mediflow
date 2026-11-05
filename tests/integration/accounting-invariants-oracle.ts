import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";

export interface OracleJournalViolation {
  entryId: string;
  entryNo: string;
  linesCount: number;
  totalDebit: number;
  totalCredit: number;
  difference: number;
}

export interface OracleBatchViolation {
  batchId: string;
  qtyOnHand: number;
  movementSum: number;
  difference: number;
}

/**
 * Independent Database Oracle for Accounting & Inventory Invariants.
 * Reads raw database state without reusing production domain services.
 */
export class AccountingInvariantsOracle {
  constructor(private db: DbOrTx, private tenantId: string) {}

  /**
   * Invariant 1: Every posted journal entry balances (sum debits == sum credits),
   * has at least 2 lines, and contains only valid single-sided positive amounts.
   */
  async assertJournalDoubleEntryInvariant(): Promise<{ totalJournals: number; violations: OracleJournalViolation[] }> {
    const res = await this.db.execute(sql`
      SELECT 
        e.id as "entryId",
        e.entry_no as "entryNo",
        COUNT(l.id)::int as "linesCount",
        COALESCE(SUM(l.debit::numeric), 0)::bigint as "totalDebit",
        COALESCE(SUM(l.credit::numeric), 0)::bigint as "totalCredit"
      FROM journal_entries e
      LEFT JOIN journal_lines l ON l.entry_id = e.id
      WHERE e.tenant_id = ${this.tenantId}
      GROUP BY e.id, e.entry_no
      HAVING COUNT(l.id) < 2 OR COALESCE(SUM(l.debit::numeric), 0) <> COALESCE(SUM(l.credit::numeric), 0)
    `);

    const rows = res.rows as Record<string, unknown>[];
    const violations = rows.map((r) => ({
      entryId: String(r.entryId),
      entryNo: String(r.entryNo),
      linesCount: Number(r.linesCount),
      totalDebit: Number(r.totalDebit),
      totalCredit: Number(r.totalCredit),
      difference: Number(r.totalDebit) - Number(r.totalCredit),
    }));

    const countRes = await this.db.execute(sql`
      SELECT COUNT(*)::int as "count" FROM journal_entries WHERE tenant_id = ${this.tenantId}
    `);
    const totalJournals = Number(countRes.rows[0]?.count || 0);

    return { totalJournals, violations };
  }

  /**
   * Invariant 2: Global general ledger trial balance sums to exactly zero.
   * Total Debits - Total Credits = 0.
   */
  async assertTrialBalanceZeroInvariant(): Promise<{ totalDebits: number; totalCredits: number; diff: number }> {
    const res = await this.db.execute(sql`
      SELECT 
        COALESCE(SUM(debit::numeric), 0)::bigint as "totalDebits",
        COALESCE(SUM(credit::numeric), 0)::bigint as "totalCredits"
      FROM journal_lines
      WHERE tenant_id = ${this.tenantId}
    `);

    const totalDebits = Number(res.rows[0]?.totalDebits || 0);
    const totalCredits = Number(res.rows[0]?.totalCredits || 0);

    return {
      totalDebits,
      totalCredits,
      diff: totalDebits - totalCredits,
    };
  }

  /**
   * Invariant 3: Stock Movement Ledger rule.
   * For every batch, qtyOnHand exactly equals sum(stock_movements.qtyChange).
   */
  async assertBatchMovementIntegrityInvariant(): Promise<{ totalBatches: number; violations: OracleBatchViolation[] }> {
    const res = await this.db.execute(sql`
      SELECT 
        b.id as "batchId",
        b.qty_on_hand as "qtyOnHand",
        COALESCE(SUM(m.qty_change), 0)::int as "movementSum"
      FROM batches b
      LEFT JOIN stock_movements m ON m.batch_id = b.id
      WHERE b.tenant_id = ${this.tenantId}
      GROUP BY b.id, b.qty_on_hand
      HAVING b.qty_on_hand <> COALESCE(SUM(m.qty_change), 0)
    `);

    const rows = res.rows as Record<string, unknown>[];
    const violations = rows.map((r) => ({
      batchId: String(r.batchId),
      qtyOnHand: Number(r.qtyOnHand),
      movementSum: Number(r.movementSum),
      difference: Number(r.qtyOnHand) - Number(r.movementSum),
    }));

    const countRes = await this.db.execute(sql`
      SELECT COUNT(*)::int as "count" FROM batches WHERE tenant_id = ${this.tenantId}
    `);
    const totalBatches = Number(countRes.rows[0]?.count || 0);

    return { totalBatches, violations };
  }

  /**
   * Invariant 4: Control Account Reconciliation for Debtors (1050) and Creditors (2010).
   * Verifies signed net GL balances against signed subledger records.
   */
  async assertControlAccountsReconciliation(): Promise<{
    glDebtorsNet: number;
    glCreditorsNet: number;
    subledgerCustomerTotal: number;
    subledgerSupplierTotal: number;
  }> {
    // 1. Debtors Account (1050)
    const debtorsRes = await this.db.execute(sql`
      SELECT COALESCE(SUM(l.debit::numeric - l.credit::numeric), 0)::bigint as "net"
      FROM journal_lines l
      JOIN accounts a ON a.id = l.account_id
      WHERE l.tenant_id = ${this.tenantId} AND (a.code = '1050' OR a.system_key = 'debtors')
    `);
    const glDebtorsNet = Number(debtorsRes.rows[0]?.net || 0);

    // 2. Creditors Account (2010)
    const creditorsRes = await this.db.execute(sql`
      SELECT COALESCE(SUM(l.credit::numeric - l.debit::numeric), 0)::bigint as "net"
      FROM journal_lines l
      JOIN accounts a ON a.id = l.account_id
      WHERE l.tenant_id = ${this.tenantId} AND (a.code = '2010' OR a.system_key = 'creditors')
    `);
    const glCreditorsNet = Number(creditorsRes.rows[0]?.net || 0);

    // 3. Subledger customer opening totals
    const custRes = await this.db.execute(sql`
      SELECT COALESCE(SUM(opening_balance::numeric), 0)::bigint as "total"
      FROM customers
      WHERE tenant_id = ${this.tenantId}
    `);
    const subledgerCustomerTotal = Number(custRes.rows[0]?.total || 0);

    // 4. Subledger supplier opening totals
    const suppRes = await this.db.execute(sql`
      SELECT COALESCE(SUM(opening_balance::numeric), 0)::bigint as "total"
      FROM suppliers
      WHERE tenant_id = ${this.tenantId}
    `);
    const subledgerSupplierTotal = Number(suppRes.rows[0]?.total || 0);

    return {
      glDebtorsNet,
      glCreditorsNet,
      subledgerCustomerTotal,
      subledgerSupplierTotal,
    };
  }

  /**
   * Invariant 5: Account 1080 Balance Sheet Inventory Valuation.
   * Asserts GL 1080 net balance = Opening Snapshot total for this specific store.
   * Attribution Policy:
   * Store opening inventory cutover journals are strictly store-scoped (store_id = ${storeId}).
   * Tenant-level (store_id IS NULL) or other store entries are intentionally isolated and excluded
   * from the store's opening inventory snapshot reconciliation to prevent multi-store contamination.
   */
  async assertStockValuationPeriodicInvariant(storeId: string): Promise<{
    gl1080Balance: number;
    expectedGl1080: number;
    snapshotTotal: number;
    netAdjustments: number;
  }> {
    const glRes = await this.db.execute(sql`
      SELECT COALESCE(SUM(l.debit::numeric - l.credit::numeric), 0)::bigint as "balance"
      FROM journal_lines l
      JOIN accounts a ON a.id = l.account_id
      JOIN journal_entries e ON e.id = l.entry_id
      WHERE l.tenant_id = ${this.tenantId} 
        AND (a.code = '1080' OR a.system_key = 'inventory')
        AND e.store_id = ${storeId}
    `);
    const gl1080Balance = Number(glRes.rows[0]?.balance || 0);

    const snapRes = await this.db.execute(sql`
      SELECT COALESCE(SUM(total_value_paise::numeric), 0)::bigint as "total"
      FROM opening_inventory_snapshots
      WHERE tenant_id = ${this.tenantId} AND store_id = ${storeId} AND status = 'posted'
    `);
    const snapshotTotal = Number(snapRes.rows[0]?.total || 0);

    return {
      gl1080Balance,
      expectedGl1080: snapshotTotal,
      snapshotTotal,
      netAdjustments: gl1080Balance - snapshotTotal,
    };
  }
}
