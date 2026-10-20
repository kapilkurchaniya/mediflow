"use server";

import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { getOrSeedAccounts } from "@/server/domain/accounting";

export async function getAccounts() {
  const ctx = await requirePermission("accounting.view");

  // Ensure standard accounts exist
  await getOrSeedAccounts(db, ctx.tenantId);

  return db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.tenantId, ctx.tenantId))
    .orderBy(schema.accounts.code);
}

export async function getJournalLines(dateFrom?: string | null, dateTo?: string | null) {
  const ctx = await requirePermission("accounting.view");

  const conditions = [
    eq(schema.journalLines.tenantId, ctx.tenantId),
    eq(schema.journalEntries.storeId, ctx.storeId),
  ];

  if (dateFrom) {
    conditions.push(gte(schema.journalEntries.entryDate, dateFrom));
  }
  if (dateTo) {
    conditions.push(lte(schema.journalEntries.entryDate, dateTo));
  }

  return db
    .select({
      line: schema.journalLines,
      entry: schema.journalEntries,
      account: schema.accounts,
    })
    .from(schema.journalLines)
    .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
    .innerJoin(schema.accounts, eq(schema.journalLines.accountId, schema.accounts.id))
    .where(and(...conditions))
    .orderBy(desc(schema.journalEntries.entryDate), desc(schema.journalEntries.createdAt))
    .limit(50);
}

export interface TrialBalanceRow {
  id: string;
  code: string;
  name: string;
  type: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export async function getTrialBalance(dateFrom?: string | null, dateTo?: string | null): Promise<TrialBalanceRow[]> {
  const ctx = await requirePermission("accounting.view");

  // Ensure accounts are seeded
  await getOrSeedAccounts(db, ctx.tenantId);

  // Build date condition for journal entries
  let dateCondition = sql``;
  if (dateFrom && dateTo) {
    dateCondition = sql`AND je.entry_date >= ${dateFrom} AND je.entry_date <= ${dateTo}`;
  } else if (dateFrom) {
    dateCondition = sql`AND je.entry_date >= ${dateFrom}`;
  } else if (dateTo) {
    dateCondition = sql`AND je.entry_date <= ${dateTo}`;
  }

  const results = await db.execute(sql`
    SELECT 
      a.id, 
      a.code, 
      a.name, 
      a.type,
      COALESCE(SUM(jl.debit), 0) as total_debit,
      COALESCE(SUM(jl.credit), 0) as total_credit
    FROM ${schema.accounts} a
    LEFT JOIN (
      ${schema.journalLines} jl
      INNER JOIN ${schema.journalEntries} je 
        ON jl.entry_id = je.id 
        AND je.tenant_id = ${ctx.tenantId}
        AND (je.store_id = ${ctx.storeId} OR je.store_id IS NULL)
        ${dateCondition}
    ) ON a.id = jl.account_id
    WHERE a.tenant_id = ${ctx.tenantId}
    GROUP BY a.id, a.code, a.name, a.type
    HAVING COALESCE(SUM(jl.debit), 0) > 0 OR COALESCE(SUM(jl.credit), 0) > 0
    ORDER BY a.type, a.code
  `);

  return results.rows.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    type: String(r.type),
    totalDebit: Number(r.total_debit),
    totalCredit: Number(r.total_credit),
    balance: Number(r.total_debit) - Number(r.total_credit),
  }));
}



