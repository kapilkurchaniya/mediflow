import { schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/server/db";
import { assertAccountingPeriodOpen } from "../accounting-periods";
import { getOrSeedAccounts } from "../accounting";
import { nextDocNumber } from "../sequence";
import { writeAudit } from "@/server/audit";
import { computeCanonicalPayloadHash } from "./types";
import type { OpeningBalanceResult } from "./types";

export interface PostCustomerParams {
  tenantId: string;
  storeId?: string;
  customerId: string;
  amountPaise: number;
  asOfDate: string;
  userId: string;
}

/**
 * Authoritative customer opening balance posting.
 * Reconciles 1:1 with Account 1050 (Customer Receivables) and Account 3999.
 */
export async function postCustomerOpeningBalance(
  dbOrTx: DbOrTx,
  params: PostCustomerParams
): Promise<OpeningBalanceResult> {
  return await dbOrTx.transaction(async (tx) => {
    const { tenantId, storeId, customerId, amountPaise, asOfDate, userId } = params;

    if (amountPaise === 0) {
      throw new Error("Opening balance amount cannot be zero");
    }

    // 1. Period guard (A5.4 master-first lock)
    await assertAccountingPeriodOpen(tx, { tenantId, entryDate: asOfDate, storeId });

    // 2. Canonical payload hash & idempotency check
    const payloadHash = computeCanonicalPayloadHash({
      tenantId,
      storeId: storeId || "",
      entityType: "customer",
      entityId: customerId,
      asOfDate,
      amountPaise,
    });

    const [existing] = await tx
      .select()
      .from(schema.openingBalanceRecords)
      .where(
        and(
          eq(schema.openingBalanceRecords.tenantId, tenantId),
          eq(schema.openingBalanceRecords.entityType, "customer"),
          eq(schema.openingBalanceRecords.entityId, customerId),
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
      throw new Error(`Conflict: Opening balance already posted for this customer on ${asOfDate} with a different amount`);
    }

    // 3. Lock customer row FOR UPDATE
    const [customer] = await tx
      .select({ id: schema.customers.id, name: schema.customers.name })
      .from(schema.customers)
      .where(and(eq(schema.customers.id, customerId), eq(schema.customers.tenantId, tenantId)))
      .for("update");

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    const accounts = await getOrSeedAccounts(tx, tenantId);
    if (!accounts.debtors || !accounts.opening_balance_equity) {
      throw new Error("System accounts 1050 (debtors) and 3999 (opening_balance_equity) are required");
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
        narration: `Opening balance for customer ${customer.name} as of ${asOfDate}`,
        refType: "opening_balance",
        refId: customerId,
        createdBy: userId,
      })
      .returning({ id: schema.journalEntries.id });

    const absAmount = Math.abs(amountPaise);
    if (amountPaise > 0) {
      // Customer owes us: Dr 1050 (Debtors) / Cr 3999 (Opening Balance Equity)
      await tx.insert(schema.journalLines).values([
        {
          tenantId,
          entryId: journal.id,
          accountId: accounts.debtors,
          debit: absAmount,
          credit: 0,
          partyType: "customer",
          partyId: customerId,
        },
        {
          tenantId,
          entryId: journal.id,
          accountId: accounts.opening_balance_equity,
          debit: 0,
          credit: absAmount,
        },
      ]);
    } else {
      // Customer credit / advance: Dr 3999 / Cr 1050 (Debtors)
      await tx.insert(schema.journalLines).values([
        {
          tenantId,
          entryId: journal.id,
          accountId: accounts.opening_balance_equity,
          debit: absAmount,
          credit: 0,
        },
        {
          tenantId,
          entryId: journal.id,
          accountId: accounts.debtors,
          debit: 0,
          credit: absAmount,
          partyType: "customer",
          partyId: customerId,
        },
      ]);
    }

    // 5. Update subledger opening balance
    await tx
      .update(schema.customers)
      .set({ openingBalance: amountPaise })
      .where(eq(schema.customers.id, customerId));

    // 6. Record immutable opening balance record
    const [record] = await tx
      .insert(schema.openingBalanceRecords)
      .values({
        tenantId,
        storeId: storeId || null,
        entityType: "customer",
        entityId: customerId,
        asOfDate,
        amountPaise,
        journalEntryId: journal.id,
        payloadHash,
        status: "posted",
        createdBy: userId,
      })
      .returning({ id: schema.openingBalanceRecords.id });

    await writeAudit(tx, { tenantId, userId, storeId: storeId || "00000000-0000-0000-0000-000000000000" }, {
      action: "update",
      entityType: "customer",
      entityId: customerId,
      newValue: { journalEntryId: journal.id, amountPaise, asOfDate },
      reason: `Posted opening balance for customer ${customer.name}`,
    });

    return {
      recordId: record.id,
      journalEntryId: journal.id,
      alreadyPosted: false,
      status: "posted",
    };
  });
}
