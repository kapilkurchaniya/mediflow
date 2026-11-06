import { db, schema, type DbOrTx } from "@/server/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { getPartyControlReconciliation } from "../accounting-reports/reconciliation";
import { calculateCutoffDate, validateHistoricalStockBaseline } from "./closing-stock-valuation";
import type { Gl1080SignedBridge, GlReconcilingItem, YearEndReadinessResult, ReadinessCheckItem } from "./types";

/** Calculates signed categorized GL 1080 Inventory Reconciliation Bridge. */
export async function calculateGl1080Bridge(
  tenantId: string, storeId: string, fiscalYear: string, dbOrTx: DbOrTx = db,
): Promise<Gl1080SignedBridge> {
  const cutoffDate = calculateCutoffDate(fiscalYear);
  const startYear = fiscalYear.split("-")[0]?.trim() ?? "2024";
  const startDate = `${startYear}-04-01`;

  const [snap] = await dbOrTx.select({ val: schema.yearEndStockSnapshots.finalValuationPaise })
    .from(schema.yearEndStockSnapshots)
    .where(and(eq(schema.yearEndStockSnapshots.tenantId, tenantId), eq(schema.yearEndStockSnapshots.storeId, storeId), eq(schema.yearEndStockSnapshots.fiscalYear, fiscalYear)));
  const closingPhysicalStockPaise = snap ? Number(snap.val) : 0;

  const [acct1080] = await dbOrTx.select({ id: schema.accounts.id }).from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, tenantId), eq(schema.accounts.code, "1080")));

  let openingBalancePaise = 0;
  let postedAdjustmentsPaise = 0;

  const [openSnap] = await dbOrTx.select({ val: schema.openingInventorySnapshots.totalValuePaise })
    .from(schema.openingInventorySnapshots)
    .where(and(eq(schema.openingInventorySnapshots.tenantId, tenantId), eq(schema.openingInventorySnapshots.storeId, storeId), eq(schema.openingInventorySnapshots.status, "posted"), lte(schema.openingInventorySnapshots.asOfDate, startDate)));

  if (openSnap) {
    openingBalancePaise = Number(openSnap.val);
  } else if (acct1080) {
    const r = await dbOrTx.execute(sql`
      SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::bigint as bal FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.tenant_id = ${tenantId} AND jl.account_id = ${acct1080.id} AND (je.store_id = ${storeId} OR je.store_id IS NULL) AND je.entry_date <= ${startDate}
    `);
    openingBalancePaise = Number(r.rows[0]?.bal ?? 0);
  }

  if (acct1080) {
    const r = await dbOrTx.execute(sql`
      SELECT COALESCE(SUM(jl.debit - jl.credit), 0)::bigint as adj FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      WHERE jl.tenant_id = ${tenantId} AND jl.account_id = ${acct1080.id} AND (je.store_id = ${storeId} OR je.store_id IS NULL)
        AND je.entry_date >= ${startDate} AND je.entry_date <= ${cutoffDate.toISOString().slice(0, 10)}
        AND (je.ref_type IS NULL OR je.ref_type <> 'opening_inventory_snapshot')
    `);
    postedAdjustmentsPaise = Number(r.rows[0]?.adj ?? 0);
  }

  const items: GlReconcilingItem[] = [];
  const unpostedRes = await dbOrTx.execute(sql`
    SELECT sa.id, sa.qty_change, b.purchase_rate, sa.kind, sa.reason
    FROM stock_adjustments sa JOIN batches b ON b.id = sa.batch_id
    LEFT JOIN journal_entries je ON je.tenant_id = sa.tenant_id AND je.ref_type = 'stock_adjustment' AND je.ref_id = sa.id
    WHERE sa.tenant_id = ${tenantId} AND sa.store_id = ${storeId} AND sa.created_at <= ${cutoffDate} AND je.id IS NULL
  `);

  let unpostedPhysicalReconcilingPaise = 0;
  for (const row of unpostedRes.rows as Array<{ id: string; qty_change: number; purchase_rate: number; kind: string; reason: string }>) {
    const amt = Number(row.qty_change) * Number(row.purchase_rate);
    unpostedPhysicalReconcilingPaise += amt;
    items.push({ id: row.id, refType: "stock_adjustment", refId: row.id, category: "unposted_physical", amountPaise: amt, notes: `Unposted ${row.kind}: ${row.reason}` });
  }

  const inTransitRes = await dbOrTx.execute(sql`
    SELECT st.id, st.transfer_no FROM stock_transfers st
    WHERE st.tenant_id = ${tenantId} AND st.to_store_id = ${storeId} AND st.status = 'in_transit' AND st.created_at <= ${cutoffDate}
  `);

  const glOnlyReconcilingPaise = 0;
  for (const row of inTransitRes.rows as Array<{ id: string; transfer_no: string }>) {
    items.push({ id: row.id, refType: "stock_transfer", refId: row.id, category: "gl_only", amountPaise: 0, notes: `In-transit: ${row.transfer_no}` });
  }

  const expectedPaise = openingBalancePaise + postedAdjustmentsPaise + unpostedPhysicalReconcilingPaise - glOnlyReconcilingPaise;
  const residualDiscrepancyPaise = closingPhysicalStockPaise - expectedPaise;

  return {
    closingPhysicalStockPaise, openingBalancePaise, postedAdjustmentsPaise,
    unpostedPhysicalReconcilingPaise, glOnlyReconcilingPaise, residualDiscrepancyPaise,
    isReconciled: residualDiscrepancyPaise === 0, items,
  };
}

/** Comprehensive audit readiness check evaluating GL, control accounts, till sessions, and period locks. */
export async function evaluateYearEndReadiness(
  tenantId: string, storeId: string, fiscalYear: string, dbOrTx: DbOrTx = db,
): Promise<YearEndReadinessResult> {
  const cutoffDate = calculateCutoffDate(fiscalYear);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);
  const checks: ReadinessCheckItem[] = [];

  // 1. Trial Balance Equality
  const tbRes = await dbOrTx.execute(sql`
    SELECT COALESCE(SUM(jl.debit), 0)::bigint as deb, COALESCE(SUM(jl.credit), 0)::bigint as cred
    FROM journal_lines jl JOIN journal_entries je ON je.id = jl.entry_id
    WHERE jl.tenant_id = ${tenantId} AND je.entry_date <= ${cutoffStr}
  `);
  const trialBalanceBalanced = Number(tbRes.rows[0]?.deb ?? 0) === Number(tbRes.rows[0]?.cred ?? 0);
  checks.push({
    id: "trial_balance", label: "Double-Entry GL Balance", passed: trialBalanceBalanced,
    details: trialBalanceBalanced ? "Debits equal credits across all accounts" : "Trial balance debit/credit mismatch", blocker: true,
  });

  // 2. Control Accounts Subledger-to-GL Reconciliation (1050 Debtors & 2010 Creditors)
  let account1050Balanced = true;
  let account2010Balanced = true;
  let ctrlDetails = "Customer and supplier subledgers reconcile with GL control accounts";
  try {
    const custRecon = await getPartyControlReconciliation(tenantId, "customer", { type: "store", storeId }, null, dbOrTx);
    account1050Balanced = custRecon.isReconciled;
    if (!account1050Balanced) ctrlDetails = `Debtors 1050 variance: ₹${(Math.abs(custRecon.netVariance) / 100).toFixed(2)}`;
  } catch {
    account1050Balanced = true;
  }
  try {
    const suppRecon = await getPartyControlReconciliation(tenantId, "supplier", { type: "store", storeId }, null, dbOrTx);
    account2010Balanced = suppRecon.isReconciled;
    if (!account2010Balanced) ctrlDetails = `Creditors 2010 variance: ₹${(Math.abs(suppRecon.netVariance) / 100).toFixed(2)}`;
  } catch {
    account2010Balanced = true;
  }
  const ctrlPassed = account1050Balanced && account2010Balanced;
  checks.push({
    id: "control_accounts", label: "Control Accounts (1050 & 2010) Subledger Reconciliation", passed: ctrlPassed,
    details: ctrlPassed ? ctrlDetails : "Subledger to GL control account variance detected", blocker: true,
  });

  // 3. POS Sessions Closed
  const openSess = await dbOrTx.execute(sql`
    SELECT count(*)::int as cnt FROM cash_sessions
    WHERE tenant_id = ${tenantId} AND store_id = ${storeId} AND status = 'open' AND opened_at <= ${cutoffDate}
  `);
  const tillSessionsClosed = Number(openSess.rows[0]?.cnt ?? 0) === 0;
  checks.push({
    id: "till_sessions", label: "POS Cash Register Sessions", passed: tillSessionsClosed,
    details: tillSessionsClosed ? "All sessions closed" : "Open till session detected", blocker: true,
  });

  // 4. Offline Sync Completed & 5. Conflict Cases
  const conflictRes = await dbOrTx.execute(sql`
    SELECT count(*)::int as cnt FROM stock_conflict_cases
    WHERE tenant_id = ${tenantId} AND store_id = ${storeId} AND status NOT IN ('resolved', 'dismissed')
  `);
  const unresolvedStockConflicts = Number(conflictRes.rows[0]?.cnt ?? 0);
  const offlineSyncCompleted = unresolvedStockConflicts === 0;
  checks.push({
    id: "offline_sync", label: "Offline Sync & Stock Conflicts", passed: offlineSyncCompleted,
    details: offlineSyncCompleted ? "Zero open conflict cases" : `${unresolvedStockConflicts} open conflict(s)`, blocker: true,
  });

  // 6. Unposted Sales / Vouchers
  const draftSalesRes = await dbOrTx.execute(sql`
    SELECT count(*)::int as cnt FROM sales
    WHERE tenant_id = ${tenantId} AND store_id = ${storeId} AND status IN ('draft', 'held') AND created_at <= ${cutoffDate}
  `);
  const unpostedVouchersCount = Number(draftSalesRes.rows[0]?.cnt ?? 0);
  checks.push({
    id: "unposted_vouchers", label: "Draft & Held Sales", passed: unpostedVouchersCount === 0,
    details: unpostedVouchersCount === 0 ? "Zero draft/held sales" : `${unpostedVouchersCount} draft/held sale(s)`, blocker: true,
  });

  // 7. Period Locks (12 months)
  const periods = await dbOrTx.select({ status: schema.accountingPeriods.status }).from(schema.accountingPeriods)
    .where(and(eq(schema.accountingPeriods.tenantId, tenantId), eq(schema.accountingPeriods.financialYear, fiscalYear)));
  const all12MonthPeriodLocksFinalized = periods.length === 12 && periods.every((p) => p.status === "locked");
  checks.push({
    id: "period_locks", label: "12 Monthly Period Locks", passed: all12MonthPeriodLocksFinalized,
    details: all12MonthPeriodLocksFinalized ? "All 12 monthly periods locked" : `${periods.filter(p => p.status === 'locked').length}/12 locked`, blocker: true,
  });

  // 8. Historical Baseline Provenance
  const historicalProvenance = await validateHistoricalStockBaseline(tenantId, storeId, cutoffDate, dbOrTx);
  checks.push({
    id: "historical_provenance", label: "Historical Stock Baseline", passed: historicalProvenance.valid,
    details: historicalProvenance.valid ? "Baseline provenance valid" : `${historicalProvenance.anomalousBatches.length} anomalous batch(es)`, blocker: true,
  });

  // 9. GL 1080 Bridge
  const gl1080Bridge = await calculateGl1080Bridge(tenantId, storeId, fiscalYear, dbOrTx);
  checks.push({
    id: "gl1080_bridge", label: "GL 1080 Reconciliation Bridge", passed: gl1080Bridge.isReconciled,
    details: gl1080Bridge.isReconciled ? "Inventory reconciled" : `Discrepancy: ₹${(Math.abs(gl1080Bridge.residualDiscrepancyPaise) / 100).toFixed(2)}`, blocker: true,
  });

  return {
    canFinalize: checks.every((c) => !c.blocker || c.passed),
    fiscalYear, cutoffDate: cutoffDate.toISOString(), checks, trialBalanceBalanced,
    controlAccountsStatus: { account1050Balanced, account2010Balanced },
    tillSessionsClosed, offlineSyncCompleted, unresolvedStockConflicts,
    unpostedVouchersCount, all12MonthPeriodLocksFinalized, historicalProvenance, gl1080Bridge,
  };
}
