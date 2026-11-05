/**
 * Pre-close validation and authoritative snapshot computation.
 * Enforces data completeness before a period can be locked.
 */
import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import type { AccountingPeriod, PeriodSnapshot, PeriodValidationResult } from "./types";

export async function computePeriodSnapshot(
  tx: DbOrTx,
  tenantId: string,
  period: Pick<AccountingPeriod, "periodKey" | "financialYear" | "startDate" | "endDate" | "gstin">,
  userId: string,
): Promise<PeriodSnapshot> {
  const query = period.gstin
    ? sql`
        SELECT 
          COUNT(DISTINCT je.id)::int as entry_count,
          COALESCE(SUM(jl.debit), 0)::bigint as total_debit,
          COALESCE(SUM(jl.credit), 0)::bigint as total_credit
        FROM journal_entries je
        JOIN journal_lines jl ON jl.entry_id = je.id
        JOIN stores s ON s.id = je.store_id
        WHERE je.tenant_id = ${tenantId}
          AND s.gstin = ${period.gstin}
          AND je.entry_date >= ${period.startDate}
          AND je.entry_date <= ${period.endDate}
      `
    : sql`
        SELECT 
          COUNT(DISTINCT je.id)::int as entry_count,
          COALESCE(SUM(jl.debit), 0)::bigint as total_debit,
          COALESCE(SUM(jl.credit), 0)::bigint as total_credit
        FROM journal_entries je
        JOIN journal_lines jl ON jl.entry_id = je.id
        WHERE je.tenant_id = ${tenantId}
          AND je.entry_date >= ${period.startDate}
          AND je.entry_date <= ${period.endDate}
      `;

  const result = await tx.execute(query);
  const row = result.rows[0] as
    | { entry_count: number | string; total_debit: number | string; total_credit: number | string }
    | undefined;

  return {
    totalJournalEntries: Number(row?.entry_count ?? 0),
    totalDebitPaise: Number(row?.total_debit ?? 0),
    totalCreditPaise: Number(row?.total_credit ?? 0),
    lockedAt: new Date().toISOString(),
    lockedBy: userId,
    periodKey: period.periodKey,
    financialYear: period.financialYear,
    gstin: period.gstin,
    scope: period.gstin ? "gstin" : "master",
  };
}

export async function validatePeriodCanBeClosed(
  tx: DbOrTx,
  tenantId: string,
  period: AccountingPeriod,
  userId: string,
): Promise<PeriodValidationResult> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // 1. Check for unposted draft or held sales in period range
  const draftSalesRes = await tx.execute(sql`
    SELECT COUNT(*)::int as count
    FROM sales s
    WHERE s.tenant_id = ${tenantId}
      AND s.status IN ('draft', 'held')
      AND s.created_at >= ${period.startDate}::timestamp
      AND s.created_at < (${period.endDate}::date + interval '1 day')::timestamp
  `);
  const unpostedDraftSalesCount = Number(draftSalesRes.rows[0]?.count ?? 0);
  if (unpostedDraftSalesCount > 0) {
    blockers.push(`There are ${unpostedDraftSalesCount} draft or held sale(s) in this period that must be completed or cancelled.`);
  }

  // 2. Check for open cash register sessions in period range
  const openSessionsRes = await tx.execute(sql`
    SELECT COUNT(*)::int as count
    FROM cash_sessions cs
    WHERE cs.tenant_id = ${tenantId}
      AND cs.status = 'open'
      AND cs.opened_at >= ${period.startDate}::timestamp
      AND cs.opened_at < (${period.endDate}::date + interval '1 day')::timestamp
  `);
  const openCashSessionsCount = Number(openSessionsRes.rows[0]?.count ?? 0);
  if (openCashSessionsCount > 0) {
    blockers.push(`There are ${openCashSessionsCount} open cash register session(s) in this period that must be closed.`);
  }

  // 3. Authoritative Snapshot
  const snapshot = await computePeriodSnapshot(tx, tenantId, period, userId);

  // Balanced double-entry verification warning if debit != credit
  if (snapshot.totalDebitPaise !== snapshot.totalCreditPaise) {
    blockers.push(`General ledger is out of balance for this period: total debit (₹${(snapshot.totalDebitPaise / 100).toFixed(2)}) does not match total credit (₹${(snapshot.totalCreditPaise / 100).toFixed(2)}).`);
  }

  return {
    canClose: blockers.length === 0,
    blockers,
    warnings,
    snapshot,
    unpostedDraftSalesCount,
    openCashSessionsCount,
  };
}
