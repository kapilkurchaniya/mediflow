import { db, schema } from "@/server/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type {
  AccountInfo,
  AccountType,
  ReconciliationReport,
  ReportStoreScope,
  UnattributedPosting,
} from "./types";
import { buildStoreScopeCondition } from "./day-book";
import { getNormalBalanceSide } from "./balances";

export async function getPartyControlReconciliation(
  tenantId: string,
  partyType: "customer" | "supplier",
  storeScope: ReportStoreScope,
  partyId?: string | null,
): Promise<ReconciliationReport> {
  const systemKey = partyType === "customer" ? "debtors" : "creditors";
  const defaultCode = partyType === "customer" ? "1050" : "2010";

  // 1. Resolve Control Account (Read-only lookup)
  const [accountRow] = await db
    .select()
    .from(schema.accounts)
    .where(
      and(
        eq(schema.accounts.tenantId, tenantId),
        sql`(${schema.accounts.systemKey} = ${systemKey} OR ${schema.accounts.code} = ${defaultCode})`,
      ),
    )
    .limit(1);

  if (!accountRow) {
    throw new Error(
      `Control account for ${partyType} (key: ${systemKey}, code: ${defaultCode}) is not configured for tenant ${tenantId}.`,
    );
  }

  const normalSide = getNormalBalanceSide(accountRow.type as AccountType);
  const account: AccountInfo = {
    id: accountRow.id,
    code: accountRow.code,
    name: accountRow.name,
    type: accountRow.type as AccountType,
    normalSide,
    systemKey: accountRow.systemKey,
    isActive: accountRow.isActive,
  };

  const storeCond = buildStoreScopeCondition(storeScope);
  const baseAccountCond = and(
    eq(schema.journalLines.tenantId, tenantId),
    eq(schema.journalLines.accountId, accountRow.id),
    storeCond,
  );

  // 2. Control Account Totals
  const [controlTotals] = await db
    .select({
      dr: sql<number>`coalesce(sum(${schema.journalLines.debit}), 0)::int`,
      cr: sql<number>`coalesce(sum(${schema.journalLines.credit}), 0)::int`,
    })
    .from(schema.journalLines)
    .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
    .where(baseAccountCond);

  const controlDebit = controlTotals?.dr ?? 0;
  const controlCredit = controlTotals?.cr ?? 0;
  const controlNet = normalSide === "dr" ? controlDebit - controlCredit : controlCredit - controlDebit;

  // 3. Attributed Subledger Totals
  const subledgerConds = [
    baseAccountCond,
    eq(schema.journalLines.partyType, partyType),
    sql`${schema.journalLines.partyId} IS NOT NULL`,
  ];
  if (partyId) {
    subledgerConds.push(eq(schema.journalLines.partyId, partyId));
  }

  const [subledgerTotals] = await db
    .select({
      dr: sql<number>`coalesce(sum(${schema.journalLines.debit}), 0)::int`,
      cr: sql<number>`coalesce(sum(${schema.journalLines.credit}), 0)::int`,
    })
    .from(schema.journalLines)
    .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
    .where(and(...subledgerConds));

  const subledgerDebit = subledgerTotals?.dr ?? 0;
  const subledgerCredit = subledgerTotals?.cr ?? 0;
  const subledgerNet = normalSide === "dr" ? subledgerDebit - subledgerCredit : subledgerCredit - subledgerDebit;

  // 4. Unattributed Postings on Control Account
  const unattributedCond = and(
    baseAccountCond,
    isNull(schema.journalLines.partyId),
  );

  const [unattributedTotals] = await db
    .select({
      dr: sql<number>`coalesce(sum(${schema.journalLines.debit}), 0)::int`,
      cr: sql<number>`coalesce(sum(${schema.journalLines.credit}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.journalLines)
    .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
    .where(unattributedCond);

  const unattributedDebit = unattributedTotals?.dr ?? 0;
  const unattributedCredit = unattributedTotals?.cr ?? 0;
  const unattributedCount = unattributedTotals?.count ?? 0;
  const unattributedNet = normalSide === "dr"
    ? unattributedDebit - unattributedCredit
    : unattributedCredit - unattributedDebit;

  // 5. Compute Variances
  const debitVariance = controlDebit - (subledgerDebit + unattributedDebit);
  const creditVariance = controlCredit - (subledgerCredit + unattributedCredit);
  const netVariance = controlNet - (subledgerNet + unattributedNet);
  const isReconciled = debitVariance === 0 && creditVariance === 0 && unattributedCount === 0;

  // 6. Fetch Sample Unattributed Postings (up to 20 for diagnostic preview)
  const unattributedRows = unattributedCount > 0
    ? await db
        .select({
          entryId: schema.journalEntries.id,
          entryNo: schema.journalEntries.entryNo,
          entryDate: schema.journalEntries.entryDate,
          narration: schema.journalEntries.narration,
          refType: schema.journalEntries.refType,
          refId: schema.journalEntries.refId,
          debit: schema.journalLines.debit,
          credit: schema.journalLines.credit,
        })
        .from(schema.journalLines)
        .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
        .where(unattributedCond)
        .limit(20)
    : [];

  const unattributedPostings: UnattributedPosting[] = unattributedRows.map((r) => ({
    entryId: r.entryId,
    entryNo: r.entryNo,
    entryDate: r.entryDate,
    narration: r.narration,
    refType: r.refType,
    refId: r.refId,
    debit: r.debit,
    credit: r.credit,
  }));

  let partyName: string | null = null;
  if (partyId) {
    if (partyType === "customer") {
      const [c] = await db
        .select({ name: schema.customers.name })
        .from(schema.customers)
        .where(and(eq(schema.customers.tenantId, tenantId), eq(schema.customers.id, partyId)));
      partyName = c?.name ?? null;
    } else {
      const [s] = await db
        .select({ name: schema.suppliers.name })
        .from(schema.suppliers)
        .where(and(eq(schema.suppliers.tenantId, tenantId), eq(schema.suppliers.id, partyId)));
      partyName = s?.name ?? null;
    }
  }

  return {
    account,
    partyType,
    partyId,
    partyName,
    controlDebit,
    controlCredit,
    controlNet,
    subledgerDebit,
    subledgerCredit,
    subledgerNet,
    unattributedDebit,
    unattributedCredit,
    unattributedNet,
    debitVariance,
    creditVariance,
    netVariance,
    isReconciled,
    unattributedCount,
    unattributedPostings,
  };
}
