"use server";

import { db, schema } from "@/server/db";
import { eq, and, sql, desc } from "drizzle-orm";
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

export async function getJournalLines() {
  const { session } = await getCurrentSession();
  if (!session?.tenantId || !session?.storeId) throw new Error("Unauthorized");

  // In a real system, you'd filter by date range. For now, fetch recent 50.
  return db
    .select({
      line: schema.journalLines,
      entry: schema.journalEntries,
      account: schema.accounts,
    })
    .from(schema.journalLines)
    .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
    .innerJoin(schema.accounts, eq(schema.journalLines.accountId, schema.accounts.id))
    .where(
      and(
        eq(schema.journalLines.tenantId, session.tenantId),
        eq(schema.journalEntries.storeId, session.storeId)
      )
    )
    .orderBy(desc(schema.journalEntries.entryDate), desc(schema.journalEntries.createdAt))
    .limit(50);
}

export async function getTrialBalance() {
  const { session } = await getCurrentSession();
  if (!session?.tenantId || !session?.storeId) throw new Error("Unauthorized");

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
    LEFT JOIN ${schema.journalEntries} je ON jl.entry_id = je.id AND je.store_id = ${session.storeId}
    WHERE a.tenant_id = ${session.tenantId}
    GROUP BY a.id, a.code, a.name, a.type
    HAVING COALESCE(SUM(jl.debit), 0) > 0 OR COALESCE(SUM(jl.credit), 0) > 0
    ORDER BY a.type, a.code
  `);

  return results.rows.map((r: any) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    totalDebit: Number(r.total_debit),
    totalCredit: Number(r.total_credit),
    balance: Number(r.total_debit) - Number(r.total_credit),
  }));
}
