"use server";

import { db, schema } from "@/server/db";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { getCurrentSession } from "@/server/auth";

export async function getAccounts() {
  const { session } = await getCurrentSession();
  if (!session?.tenantId) throw new Error("Unauthorized");

  return db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.tenantId, session.tenantId))
    .orderBy(schema.accounts.name);
}

export async function getJournalLines(dateFrom?: string | null, dateTo?: string | null) {
  const { session } = await getCurrentSession();
  if (!session?.tenantId || !session?.storeId) throw new Error("Unauthorized");

  const conditions = [
    eq(schema.journalLines.tenantId, session.tenantId),
    eq(schema.journalEntries.storeId, session.storeId),
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

export async function getTrialBalance(dateFrom?: string | null, dateTo?: string | null) {
  const { session } = await getCurrentSession();
  if (!session?.tenantId || !session?.storeId) throw new Error("Unauthorized");

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
    LEFT JOIN ${schema.journalLines} jl ON a.id = jl.account_id 
    LEFT JOIN ${schema.journalEntries} je ON jl.entry_id = je.id AND je.store_id = ${session.storeId} ${dateCondition}
    WHERE a.tenant_id = ${session.tenantId}
    GROUP BY a.id, a.code, a.name, a.type
    HAVING COALESCE(SUM(jl.debit), 0) > 0 OR COALESCE(SUM(jl.credit), 0) > 0
    ORDER BY a.type, a.code
  `);

  return results.rows.map((r: Record<string, unknown>) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    totalDebit: Number(r.total_debit),
    totalCredit: Number(r.total_credit),
    balance: Number(r.total_debit) - Number(r.total_credit),
  }));
}

