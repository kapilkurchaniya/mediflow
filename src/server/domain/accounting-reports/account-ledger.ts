import { db, schema } from "@/server/db";
import { and, asc, eq, gt, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import type {
  AccountInfo,
  AccountType,
  LedgerCursor,
  LedgerFilter,
  LedgerReport,
  LedgerRow,
  NormalBalanceSide,
} from "./types";
import {
  buildBaseLedgerConditions,
  computeBalanceValueAndSide,
  getNormalBalanceSide,
} from "./balances";

export async function getAccountLedgerReport(
  tenantId: string,
  filter: LedgerFilter,
): Promise<LedgerReport> {
  const { accountId, dateRange, storeScope, partyType, partyId, cursor, limit = 50 } = filter;

  // 1. Resolve Account Info (read-only)
  const [accountRow] = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, tenantId), eq(schema.accounts.id, accountId)))
    .limit(1);

  if (!accountRow) {
    throw new Error(`Account not found or inaccessible: ${accountId}`);
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

  const baseConds = buildBaseLedgerConditions(tenantId, accountId, storeScope, partyType, partyId);

  // 2. Compute Period Opening Balance (entries prior to dateRange.from)
  let periodDebit0 = 0;
  let periodCredit0 = 0;
  if (dateRange.from) {
    const [openRes] = await db
      .select({
        dr: sql<number>`coalesce(sum(${schema.journalLines.debit}), 0)::int`,
        cr: sql<number>`coalesce(sum(${schema.journalLines.credit}), 0)::int`,
      })
      .from(schema.journalLines)
      .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
      .where(and(...baseConds, sql`${schema.journalEntries.entryDate} < ${dateRange.from}`));
    periodDebit0 = openRes?.dr ?? 0;
    periodCredit0 = openRes?.cr ?? 0;
  }
  const { balance: periodOpeningBalance, side: periodOpeningSide } = computeBalanceValueAndSide(
    periodDebit0,
    periodCredit0,
    normalSide,
  );

  // 3. Compute Page Anchor (if cursor provided, accumulate delta between dateRange.from and cursor)
  let pageDebit0 = periodDebit0;
  let pageCredit0 = periodCredit0;
  if (cursor) {
    const lineIdNum = Number(cursor.lineId);
    const [cursorDeltaRes] = await db
      .select({
        dr: sql<number>`coalesce(sum(${schema.journalLines.debit}), 0)::int`,
        cr: sql<number>`coalesce(sum(${schema.journalLines.credit}), 0)::int`,
      })
      .from(schema.journalLines)
      .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
      .where(
        and(
          ...baseConds,
          dateRange.from ? gte(schema.journalEntries.entryDate, dateRange.from) : sql`TRUE`,
          or(
            sql`${schema.journalEntries.entryDate} < ${cursor.entryDate}`,
            and(
              eq(schema.journalEntries.entryDate, cursor.entryDate),
              sql`${schema.journalLines.id} <= ${lineIdNum}`,
            ),
          ),
        ),
      );
    pageDebit0 += cursorDeltaRes?.dr ?? 0;
    pageCredit0 += cursorDeltaRes?.cr ?? 0;
  }
  const { balance: pageOpeningBalance, side: pageOpeningSide } = computeBalanceValueAndSide(
    pageDebit0,
    pageCredit0,
    normalSide,
  );

  // 4. Fetch Page Rows using Keyset Pagination
  const queryConds: SQL[] = [...baseConds];
  if (dateRange.from) queryConds.push(gte(schema.journalEntries.entryDate, dateRange.from));
  if (dateRange.to) queryConds.push(lte(schema.journalEntries.entryDate, dateRange.to));

  if (cursor) {
    const lineIdNum = Number(cursor.lineId);
    queryConds.push(
      or(
        gt(schema.journalEntries.entryDate, cursor.entryDate),
        and(
          eq(schema.journalEntries.entryDate, cursor.entryDate),
          gt(schema.journalLines.id, lineIdNum),
        ),
      )!,
    );
  }

  const rawLines = await db
    .select({
      lineId: schema.journalLines.id,
      entryId: schema.journalEntries.id,
      entryNo: schema.journalEntries.entryNo,
      entryDate: schema.journalEntries.entryDate,
      createdAt: schema.journalEntries.createdAt,
      refType: schema.journalEntries.refType,
      refId: schema.journalEntries.refId,
      narration: schema.journalEntries.narration,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
      partyType: schema.journalLines.partyType,
      partyId: schema.journalLines.partyId,
    })
    .from(schema.journalLines)
    .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
    .where(and(...queryConds))
    .orderBy(
      asc(schema.journalEntries.entryDate),
      asc(schema.journalLines.id),
    )
    .limit(limit + 1);

  const hasMore = rawLines.length > limit;
  const pageLines = rawLines.slice(0, limit);

  // 5. Build Particulars for each page line by inspecting complete journal entries
  const entryIds = [...new Set(pageLines.map((l) => l.entryId))];
  const counterpartLines = entryIds.length > 0
    ? await db
        .select({
          entryId: schema.journalLines.entryId,
          accountId: schema.journalLines.accountId,
          accountName: schema.accounts.name,
          debit: schema.journalLines.debit,
          credit: schema.journalLines.credit,
        })
        .from(schema.journalLines)
        .innerJoin(schema.accounts, eq(schema.journalLines.accountId, schema.accounts.id))
        .where(inArray(schema.journalLines.entryId, entryIds))
    : [];

  const counterpartMap = new Map<string, { accountId: string; accountName: string }[]>();
  for (const c of counterpartLines) {
    const list = counterpartMap.get(c.entryId) ?? [];
    list.push({ accountId: c.accountId, accountName: c.accountName });
    counterpartMap.set(c.entryId, list);
  }

  // Running balance accumulator starting from signed net before page
  let runningSigned = normalSide === "dr" ? pageDebit0 - pageCredit0 : pageCredit0 - pageDebit0;

  const rows: LedgerRow[] = pageLines.map((line) => {
    const delta = normalSide === "dr" ? line.debit - line.credit : line.credit - line.debit;
    runningSigned += delta;

    const currentRunningSide: NormalBalanceSide = runningSigned >= 0
      ? normalSide
      : normalSide === "dr" ? "cr" : "dr";

    const allLinesForEntry = counterpartMap.get(line.entryId) ?? [];
    const opposing = allLinesForEntry.filter((c) => c.accountId !== accountId);

    const prefix = line.debit > 0 ? "To " : "By ";
    let particulars = "";
    let isCompound = false;

    if (opposing.length === 1) {
      particulars = `${prefix}${opposing[0]?.accountName ?? "Opposing Account"}`;
    } else if (opposing.length > 1) {
      isCompound = true;
      particulars = `${prefix}Multiple Accounts (Compound Entry)`;
    } else {
      particulars = line.narration || "Journal Adjustment";
    }

    return {
      lineId: String(line.lineId),
      entryId: line.entryId,
      entryNo: line.entryNo,
      entryDate: line.entryDate,
      createdAt: line.createdAt.toISOString(),
      voucherType: line.refType,
      refId: line.refId,
      narration: line.narration,
      particulars,
      isCompound,
      debit: line.debit,
      credit: line.credit,
      runningBalance: Math.abs(runningSigned),
      runningSide: currentRunningSide,
    };
  });

  // 6. Compute Period Movement and Period Closing Balance
  const periodConds = [...baseConds];
  if (dateRange.from) periodConds.push(gte(schema.journalEntries.entryDate, dateRange.from));
  if (dateRange.to) periodConds.push(lte(schema.journalEntries.entryDate, dateRange.to));

  const [periodTotalsRes] = await db
    .select({
      dr: sql<number>`coalesce(sum(${schema.journalLines.debit}), 0)::int`,
      cr: sql<number>`coalesce(sum(${schema.journalLines.credit}), 0)::int`,
    })
    .from(schema.journalLines)
    .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
    .where(and(...periodConds));

  const periodDebitTotal = periodTotalsRes?.dr ?? 0;
  const periodCreditTotal = periodTotalsRes?.cr ?? 0;

  const totalDebitAll = periodDebit0 + periodDebitTotal;
  const totalCreditAll = periodCredit0 + periodCreditTotal;
  const { balance: periodClosingBalance, side: periodClosingSide } = computeBalanceValueAndSide(
    totalDebitAll,
    totalCreditAll,
    normalSide,
  );

  const lastRow = rows[rows.length - 1];
  const nextCursor: LedgerCursor | null = hasMore && lastRow
    ? { entryDate: lastRow.entryDate, createdAt: lastRow.createdAt, lineId: lastRow.lineId }
    : null;

  return {
    account,
    periodOpeningBalance,
    periodOpeningSide,
    pageOpeningBalance,
    pageOpeningSide,
    rows,
    periodDebitTotal,
    periodCreditTotal,
    periodClosingBalance,
    periodClosingSide,
    nextCursor,
    hasMore,
  };
}
