import { db, schema, type DbOrTx } from "@/server/db";
import { and, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type {
  AccountType,
  DayBookEntryRow,
  DayBookFilter,
  DayBookLineItem,
  DayBookReport,
  ReportStoreScope,
} from "./types";

export function buildStoreScopeCondition(storeScope: ReportStoreScope): SQL {
  if (storeScope.type === "store") {
    return eq(schema.journalEntries.storeId, storeScope.storeId);
  }
  if (storeScope.type === "unallocated") {
    return isNull(schema.journalEntries.storeId);
  }
  return sql`TRUE`;
}

export function buildVoucherTypeCondition(voucherType?: string): SQL | undefined {
  if (!voucherType || voucherType === "all") return undefined;
  if (voucherType === "journal") {
    return or(eq(schema.journalEntries.refType, "journal"), isNull(schema.journalEntries.refType));
  }
  return eq(schema.journalEntries.refType, voucherType);
}

export async function getDayBookReport(
  tenantId: string,
  filter: DayBookFilter,
  d: DbOrTx = db,
): Promise<DayBookReport> {
  const { dateRange, storeScope, voucherType, limit = 50, offset = 0 } = filter;
  const storeCond = buildStoreScopeCondition(storeScope);
  const voucherCond = buildVoucherTypeCondition(voucherType);

  const entryConditions: SQL[] = [
    eq(schema.journalEntries.tenantId, tenantId),
    storeCond,
  ];

  if (dateRange.from) {
    entryConditions.push(gte(schema.journalEntries.entryDate, dateRange.from));
  }
  if (dateRange.to) {
    entryConditions.push(lte(schema.journalEntries.entryDate, dateRange.to));
  }
  if (voucherCond) {
    entryConditions.push(voucherCond);
  }

  const whereClause = and(...entryConditions);

  // 1. Compute summary totals over the entire filtered scope
  const summaryResult = await d
    .select({
      totalVouchers: sql<number>`count(distinct ${schema.journalEntries.id})::int`,
      totalDebit: sql<number>`coalesce(sum(${schema.journalLines.debit}), 0)::int`,
      totalCredit: sql<number>`coalesce(sum(${schema.journalLines.credit}), 0)::int`,
    })
    .from(schema.journalEntries)
    .leftJoin(schema.journalLines, eq(schema.journalEntries.id, schema.journalLines.entryId))
    .where(whereClause);

  const totalVouchers = summaryResult[0]?.totalVouchers ?? 0;
  const totalDebit = summaryResult[0]?.totalDebit ?? 0;
  const totalCredit = summaryResult[0]?.totalCredit ?? 0;
  const isBalanced = totalDebit === totalCredit;

  if (totalVouchers === 0) {
    return {
      entries: [],
      totalVouchers: 0,
      totalDebit: 0,
      totalCredit: 0,
      isBalanced: true,
      hasMore: false,
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  // 2. Fetch paginated distinct journal entries with store info
  const entryRows = await d
    .select({
      id: schema.journalEntries.id,
      entryNo: schema.journalEntries.entryNo,
      entryDate: schema.journalEntries.entryDate,
      createdAt: schema.journalEntries.createdAt,
      narration: schema.journalEntries.narration,
      refType: schema.journalEntries.refType,
      refId: schema.journalEntries.refId,
      storeId: schema.journalEntries.storeId,
      storeName: schema.stores.name,
    })
    .from(schema.journalEntries)
    .leftJoin(schema.stores, eq(schema.journalEntries.storeId, schema.stores.id))
    .where(whereClause)
    .orderBy(
      desc(schema.journalEntries.entryDate),
      desc(schema.journalEntries.createdAt),
      desc(schema.journalEntries.id),
    )
    .limit(limit)
    .offset(offset);

  if (entryRows.length === 0) {
    return {
      entries: [],
      totalVouchers,
      totalDebit,
      totalCredit,
      isBalanced,
      hasMore: false,
      page: Math.floor(offset / limit) + 1,
      limit,
    };
  }

  const entryIds = entryRows.map((e) => e.id);

  // 3. Fetch all journal lines for these entries
  const lineRows = await d
    .select({
      id: schema.journalLines.id,
      entryId: schema.journalLines.entryId,
      accountId: schema.journalLines.accountId,
      accountCode: schema.accounts.code,
      accountName: schema.accounts.name,
      accountType: schema.accounts.type,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
      partyType: schema.journalLines.partyType,
      partyId: schema.journalLines.partyId,
    })
    .from(schema.journalLines)
    .innerJoin(schema.accounts, eq(schema.journalLines.accountId, schema.accounts.id))
    .where(and(eq(schema.journalLines.tenantId, tenantId), inArray(schema.journalLines.entryId, entryIds)))
    .orderBy(schema.journalLines.id);

  // Resolve party names for customer / supplier lines
  const customerIds = lineRows
    .filter((l) => l.partyType === "customer" && l.partyId)
    .map((l) => l.partyId as string);
  const supplierIds = lineRows
    .filter((l) => l.partyType === "supplier" && l.partyId)
    .map((l) => l.partyId as string);

  const customerMap = new Map<string, string>();
  if (customerIds.length > 0) {
    const customers = await d
      .select({ id: schema.customers.id, name: schema.customers.name })
      .from(schema.customers)
      .where(and(eq(schema.customers.tenantId, tenantId), inArray(schema.customers.id, customerIds)));
    for (const c of customers) customerMap.set(c.id, c.name);
  }

  const supplierMap = new Map<string, string>();
  if (supplierIds.length > 0) {
    const suppliers = await d
      .select({ id: schema.suppliers.id, name: schema.suppliers.name })
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.tenantId, tenantId), inArray(schema.suppliers.id, supplierIds)));
    for (const s of suppliers) supplierMap.set(s.id, s.name);
  }

  const linesByEntry = new Map<string, DayBookLineItem[]>();
  for (const line of lineRows) {
    let partyName: string | null = null;
    if (line.partyType === "customer" && line.partyId) {
      partyName = customerMap.get(line.partyId) ?? null;
    } else if (line.partyType === "supplier" && line.partyId) {
      partyName = supplierMap.get(line.partyId) ?? null;
    }

    const item: DayBookLineItem = {
      id: String(line.id),
      accountId: line.accountId,
      accountCode: line.accountCode,
      accountName: line.accountName,
      accountType: line.accountType as AccountType,
      debit: line.debit,
      credit: line.credit,
      partyType: line.partyType,
      partyId: line.partyId,
      partyName,
    };

    const existing = linesByEntry.get(line.entryId) ?? [];
    existing.push(item);
    linesByEntry.set(line.entryId, existing);
  }

  const entries: DayBookEntryRow[] = entryRows.map((e) => {
    const lines = linesByEntry.get(e.id) ?? [];
    const entryDebit = lines.reduce((s, l) => s + l.debit, 0);
    const entryCredit = lines.reduce((s, l) => s + l.credit, 0);
    return {
      id: e.id,
      entryNo: e.entryNo,
      entryDate: e.entryDate,
      createdAt: e.createdAt.toISOString(),
      narration: e.narration,
      refType: e.refType,
      refId: e.refId,
      storeId: e.storeId,
      storeName: e.storeName,
      totalDebit: entryDebit,
      totalCredit: entryCredit,
      isBalanced: entryDebit === entryCredit,
      lines,
    };
  });

  return {
    entries,
    totalVouchers,
    totalDebit,
    totalCredit,
    isBalanced,
    hasMore: offset + limit < totalVouchers,
    page: Math.floor(offset / limit) + 1,
    limit,
  };
}
