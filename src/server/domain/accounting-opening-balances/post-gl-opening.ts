import { schema } from "@/server/db";
import { eq, and, sql } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/server/db";
import { assertAccountingPeriodOpen } from "../accounting-periods";
import { getOrSeedAccounts } from "../accounting";
import { nextDocNumber } from "../sequence";
import { writeAudit } from "@/server/audit";
import { computeCanonicalPayloadHash } from "./types";
import type { OpeningBalanceResult } from "./types";

export interface PostGLParams {
  tenantId: string;
  storeId?: string;
  accountId: string;
  direction: "debit" | "credit";
  amountPaise: number;
  asOfDate: string;
  narration: string;
  userId: string;
}

export interface ReclassifyEquityParams {
  tenantId: string;
  storeId?: string;
  targetAccountId: string;
  entryDate: string;
  reason: string;
  userId: string;
}

/**
 * General Ledger account opening balance posting (excluding control accounts 1050, 2010, 1080).
 */
export async function postGeneralLedgerOpeningBalance(
  dbOrTx: DbOrTx,
  params: PostGLParams
): Promise<OpeningBalanceResult> {
  return await dbOrTx.transaction(async (tx) => {
    const { tenantId, storeId, accountId, direction, amountPaise, asOfDate, narration, userId } = params;

  if (amountPaise <= 0) {
    throw new Error("Amount must be positive");
  }

  // 1. Period guard
  await assertAccountingPeriodOpen(tx, { tenantId, entryDate: asOfDate, storeId });

  // 2. Fetch and guard target account
  const [account] = await tx
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.id, accountId), eq(schema.accounts.tenantId, tenantId)));

  if (!account) {
    throw new Error(`Account ${accountId} not found`);
  }

  // Control account protection
  if (account.code === "1050" || account.systemKey === "debtors") {
    throw new Error("Direct opening balance to Account 1050 (Customer Receivables) is prohibited; use customer opening balance");
  }
  if (account.code === "2010" || account.systemKey === "creditors") {
    throw new Error("Direct opening balance to Account 2010 (Supplier Payables) is prohibited; use supplier opening balance");
  }
  if (account.code === "1080" || account.systemKey === "inventory") {
    throw new Error("Direct opening balance to Account 1080 (Stock in Hand) is prohibited; use inventory snapshot posting");
  }

  // 3. Idempotency check
  const payloadHash = computeCanonicalPayloadHash({
    tenantId,
    storeId: storeId || "",
    entityType: "account",
    entityId: accountId,
    asOfDate,
    amountPaise,
    direction,
  });

  const [existing] = await tx
    .select()
    .from(schema.openingBalanceRecords)
    .where(
      and(
        eq(schema.openingBalanceRecords.tenantId, tenantId),
        eq(schema.openingBalanceRecords.entityType, "account"),
        eq(schema.openingBalanceRecords.entityId, accountId),
        eq(schema.openingBalanceRecords.asOfDate, asOfDate)
      )
    );

  if (existing) {
    if (existing.payloadHash === payloadHash) {
      return {
        recordId: existing.id,
        journalEntryId: existing.journalEntryId,
        alreadyPosted: true,
        status: existing.status as "posted" | "reversed",
      };
    }
    throw new Error(`Conflict: Opening balance already posted for account ${account.name} on ${asOfDate} with different values`);
  }

  const accounts = await getOrSeedAccounts(tx, tenantId);
  const equityId = accounts.opening_balance_equity;
  if (!equityId) {
    throw new Error("System account 3999 (opening_balance_equity) is required");
  }

  // 4. Create authoritative double-entry journal
  const entryNo = await nextDocNumber(tx as Tx, tenantId, storeId || "00000000-0000-0000-0000-000000000000", "journal", "JV");
  const [journal] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId: storeId || null,
      entryNo,
      entryDate: asOfDate,
      narration: `Opening balance for ${account.name}: ${narration}`,
      refType: "opening_balance",
      refId: accountId,
      createdBy: userId,
    })
    .returning({ id: schema.journalEntries.id });

  if (direction === "debit") {
    await tx.insert(schema.journalLines).values([
      { tenantId, entryId: journal.id, accountId, debit: amountPaise, credit: 0 },
      { tenantId, entryId: journal.id, accountId: equityId, debit: 0, credit: amountPaise },
    ]);
  } else {
    await tx.insert(schema.journalLines).values([
      { tenantId, entryId: journal.id, accountId: equityId, debit: amountPaise, credit: 0 },
      { tenantId, entryId: journal.id, accountId, debit: 0, credit: amountPaise },
    ]);
  }

  const [record] = await tx
    .insert(schema.openingBalanceRecords)
    .values({
      tenantId,
      storeId: storeId || null,
      entityType: "account",
      entityId: accountId,
      asOfDate,
      amountPaise: direction === "debit" ? amountPaise : -amountPaise,
      journalEntryId: journal.id,
      payloadHash,
      status: "posted",
      createdBy: userId,
    })
    .returning({ id: schema.openingBalanceRecords.id });

  await writeAudit(tx, { tenantId, userId, storeId: storeId || "00000000-0000-0000-0000-000000000000" }, {
    action: "create",
    entityType: "account",
    entityId: accountId,
    newValue: { journalEntryId: journal.id, direction, amountPaise, asOfDate },
    reason: `Posted opening balance for account ${account.name}`,
  });

    return {
      recordId: record.id,
      journalEntryId: journal.id,
      alreadyPosted: false,
      status: "posted",
    };
  });
}

/**
 * Reclassifies unallocated Account 3999 Opening Balance Equity to target equity/capital account.
 */
export async function reclassifyOpeningBalanceEquity(
  dbOrTx: DbOrTx,
  params: ReclassifyEquityParams
): Promise<{ journalEntryId: string; reclassifiedPaise: number }> {
  return await dbOrTx.transaction(async (tx) => {
    const { tenantId, storeId, targetAccountId, entryDate, reason, userId } = params;

  await assertAccountingPeriodOpen(tx, { tenantId, entryDate, storeId });

  const accounts = await getOrSeedAccounts(tx, tenantId);
  const equityId = accounts.opening_balance_equity;
  if (!equityId) {
    throw new Error("System account 3999 not found");
  }

  // Calculate current net balance of Account 3999
  const [balanceRow] = await tx
    .select({
      totalDebit: sql<number>`coalesce(sum(debit), 0)::bigint`,
      totalCredit: sql<number>`coalesce(sum(credit), 0)::bigint`,
    })
    .from(schema.journalLines)
    .where(and(eq(schema.journalLines.tenantId, tenantId), eq(schema.journalLines.accountId, equityId)));

  const totalDebit = Number(balanceRow?.totalDebit || 0);
  const totalCredit = Number(balanceRow?.totalCredit || 0);
  const netCredit = totalCredit - totalDebit;

  if (netCredit === 0) {
    throw new Error("Account 3999 Opening Balance Equity has zero balance; no reclassification needed");
  }

  const absAmount = Math.abs(netCredit);
  const entryNo = await nextDocNumber(tx as Tx, tenantId, storeId || "00000000-0000-0000-0000-000000000000", "journal", "JV");
  const [journal] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId: storeId || null,
      entryNo,
      entryDate,
      narration: `Reclassify Opening Balance Equity (3999) to target account: ${reason}`,
      refType: "equity_reclassification",
      createdBy: userId,
    })
    .returning({ id: schema.journalEntries.id });

  if (netCredit > 0) {
    // 3999 has credit balance: Dr 3999 / Cr targetAccount
    await tx.insert(schema.journalLines).values([
      { tenantId, entryId: journal.id, accountId: equityId, debit: absAmount, credit: 0 },
      { tenantId, entryId: journal.id, accountId: targetAccountId, debit: 0, credit: absAmount },
    ]);
  } else {
    // 3999 has debit balance: Dr targetAccount / Cr 3999
    await tx.insert(schema.journalLines).values([
      { tenantId, entryId: journal.id, accountId: targetAccountId, debit: absAmount, credit: 0 },
      { tenantId, entryId: journal.id, accountId: equityId, debit: 0, credit: absAmount },
    ]);
  }

  await writeAudit(tx, { tenantId, userId, storeId: storeId || "00000000-0000-0000-0000-000000000000" }, {
    action: "update",
    entityType: "account",
    entityId: equityId,
    newValue: { journalEntryId: journal.id, targetAccountId, reclassifiedPaise: absAmount },
    reason: `Reclassified Opening Balance Equity: ${reason}`,
  });

  return {
    journalEntryId: journal.id,
    reclassifiedPaise: absAmount,
  };
  });
}
