import { schema, db } from "@/server/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { getOrSeedAccounts } from "../accounting";

export interface OpeningBalancesSummary {
  customerReceivablesTotalPaise: number;
  supplierPayablesTotalPaise: number;
  inventoryValuationTotalPaise: number;
  generalLedgerAssetsPaise: number;
  generalLedgerLiabilitiesPaise: number;
  openingBalanceEquityNetPaise: number; // positive = credit balance, negative = debit balance
  unallocatedDiscrepancyPaise: number;
  recordsCount: number;
  snapshotsCount: number;
}

export interface PartyOpeningRow {
  id: string;
  name: string;
  phone: string | null;
  openingBalancePaise: number;
  isPosted: boolean;
  journalEntryId: string | null;
  asOfDate: string | null;
}

/**
 * Returns overall opening balance reconciliation summary across subledgers, GL, and Account 3999.
 */
export async function getOpeningBalancesSummary(tenantId: string): Promise<OpeningBalancesSummary> {
  const accounts = await getOrSeedAccounts(db, tenantId);
  const equityId = accounts.opening_balance_equity;

  // 1. Customer Subledger & GL 1050 Totals
  const [custSum] = await db
    .select({
      total: sql<number>`coalesce(sum(opening_balance), 0)::bigint`,
    })
    .from(schema.customers)
    .where(eq(schema.customers.tenantId, tenantId));

  // 2. Supplier Subledger & GL 2010 Totals
  const [suppSum] = await db
    .select({
      total: sql<number>`coalesce(sum(opening_balance), 0)::bigint`,
    })
    .from(schema.suppliers)
    .where(eq(schema.suppliers.tenantId, tenantId));

  // 3. Inventory Snapshots Total
  const [invSum] = await db
    .select({
      total: sql<number>`coalesce(sum(total_value_paise), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.openingInventorySnapshots)
    .where(
      and(
        eq(schema.openingInventorySnapshots.tenantId, tenantId),
        eq(schema.openingInventorySnapshots.status, "posted")
      )
    );

  // 4. Account 3999 Opening Balance Equity Net Balance
  let equityNetCredit = 0;
  if (equityId) {
    const [equityRow] = await db
      .select({
        debits: sql<number>`coalesce(sum(debit), 0)::bigint`,
        credits: sql<number>`coalesce(sum(credit), 0)::bigint`,
      })
      .from(schema.journalLines)
      .where(and(eq(schema.journalLines.tenantId, tenantId), eq(schema.journalLines.accountId, equityId)));

    equityNetCredit = Number(equityRow?.credits || 0) - Number(equityRow?.debits || 0);
  }

  // 5. Total posted opening records
  const [recCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.openingBalanceRecords)
    .where(and(eq(schema.openingBalanceRecords.tenantId, tenantId), eq(schema.openingBalanceRecords.status, "posted")));

  const custTotal = Number(custSum?.total || 0);
  const suppTotal = Number(suppSum?.total || 0);
  const invTotal = Number(invSum?.total || 0);

  // Theoretical equity from Assets - Liabilities
  const expectedEquityCredit = (custTotal + invTotal) - suppTotal;
  const unallocatedDiscrepancy = equityNetCredit;

  return {
    customerReceivablesTotalPaise: custTotal,
    supplierPayablesTotalPaise: suppTotal,
    inventoryValuationTotalPaise: invTotal,
    generalLedgerAssetsPaise: custTotal + invTotal,
    generalLedgerLiabilitiesPaise: suppTotal,
    openingBalanceEquityNetPaise: equityNetCredit,
    unallocatedDiscrepancyPaise: unallocatedDiscrepancy,
    recordsCount: recCount?.count || 0,
    snapshotsCount: invSum?.count || 0,
  };
}

/**
 * Returns customers or suppliers with their subledger opening balance and posting status.
 */
export async function getPartyOpeningBalances(
  tenantId: string,
  partyType: "customer" | "supplier",
  limit = 50
): Promise<PartyOpeningRow[]> {
  if (partyType === "customer") {
    const customers = await db
      .select({
        id: schema.customers.id,
        name: schema.customers.name,
        phone: schema.customers.phone,
        openingBalancePaise: schema.customers.openingBalance,
      })
      .from(schema.customers)
      .where(eq(schema.customers.tenantId, tenantId))
      .orderBy(desc(schema.customers.openingBalance))
      .limit(limit);

    const records = await db
      .select()
      .from(schema.openingBalanceRecords)
      .where(
        and(
          eq(schema.openingBalanceRecords.tenantId, tenantId),
          eq(schema.openingBalanceRecords.entityType, "customer")
        )
      );

    const recMap = new Map(records.map((r) => [r.entityId, r]));

    return customers.map((c) => {
      const rec = recMap.get(c.id);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        openingBalancePaise: c.openingBalancePaise || 0,
        isPosted: !!rec && rec.status === "posted",
        journalEntryId: rec?.journalEntryId || null,
        asOfDate: rec?.asOfDate || null,
      };
    });
  } else {
    const suppliers = await db
      .select({
        id: schema.suppliers.id,
        name: schema.suppliers.name,
        phone: schema.suppliers.phone,
        openingBalancePaise: schema.suppliers.openingBalance,
      })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.tenantId, tenantId))
      .orderBy(desc(schema.suppliers.openingBalance))
      .limit(limit);

    const records = await db
      .select()
      .from(schema.openingBalanceRecords)
      .where(
        and(
          eq(schema.openingBalanceRecords.tenantId, tenantId),
          eq(schema.openingBalanceRecords.entityType, "supplier")
        )
      );

    const recMap = new Map(records.map((r) => [r.entityId, r]));

    return suppliers.map((s) => {
      const rec = recMap.get(s.id);
      return {
        id: s.id,
        name: s.name,
        phone: s.phone,
        openingBalancePaise: s.openingBalancePaise || 0,
        isPosted: !!rec && rec.status === "posted",
        journalEntryId: rec?.journalEntryId || null,
        asOfDate: rec?.asOfDate || null,
      };
    });
  }
}
