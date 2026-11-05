import { schema } from "@/server/db";
import { eq, and } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/server/db";
import { assertAccountingPeriodOpen } from "../accounting-periods";
import { getOrSeedAccounts } from "../accounting";
import { nextDocNumber } from "../sequence";
import { writeAudit } from "@/server/audit";
import { computeCanonicalPayloadHash } from "./types";
import type { OpeningBalanceResult } from "./types";

export interface PostSupplierParams {
  tenantId: string;
  storeId?: string;
  supplierId: string;
  amountPaise: number;
  asOfDate: string;
  userId: string;
}

/**
 * Authoritative supplier opening balance posting.
 * Reconciles 1:1 with Account 2010 (Supplier Payables) and Account 3999.
 */
export async function postSupplierOpeningBalance(
  dbOrTx: DbOrTx,
  params: PostSupplierParams
): Promise<OpeningBalanceResult> {
  return await dbOrTx.transaction(async (tx) => {
    const { tenantId, storeId, supplierId, amountPaise, asOfDate, userId } = params;

    if (amountPaise === 0) {
      throw new Error("Opening balance amount cannot be zero");
    }

    // 1. Period guard
    await assertAccountingPeriodOpen(tx, { tenantId, entryDate: asOfDate, storeId });

    // 2. Idempotency check
    const payloadHash = computeCanonicalPayloadHash({
      tenantId,
      storeId: storeId || "",
      entityType: "supplier",
      entityId: supplierId,
      asOfDate,
      amountPaise,
    });

    const [existing] = await tx
      .select()
      .from(schema.openingBalanceRecords)
      .where(
        and(
          eq(schema.openingBalanceRecords.tenantId, tenantId),
          eq(schema.openingBalanceRecords.entityType, "supplier"),
          eq(schema.openingBalanceRecords.entityId, supplierId),
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
      throw new Error(`Conflict: Opening balance already posted for this supplier on ${asOfDate} with a different amount`);
    }

    // 3. Lock supplier row FOR UPDATE
    const [supplier] = await tx
      .select({ id: schema.suppliers.id, name: schema.suppliers.name })
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.id, supplierId), eq(schema.suppliers.tenantId, tenantId)))
      .for("update");

    if (!supplier) {
      throw new Error(`Supplier ${supplierId} not found`);
    }

    const accounts = await getOrSeedAccounts(tx, tenantId);
    if (!accounts.creditors || !accounts.opening_balance_equity) {
      throw new Error("System accounts 2010 (creditors) and 3999 (opening_balance_equity) are required");
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
        narration: `Opening balance for supplier ${supplier.name} as of ${asOfDate}`,
        refType: "opening_balance",
        refId: supplierId,
        createdBy: userId,
      })
      .returning({ id: schema.journalEntries.id });

    const absAmount = Math.abs(amountPaise);
    if (amountPaise > 0) {
      // We owe supplier: Dr 3999 (Opening Equity) / Cr 2010 (Creditors)
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
          accountId: accounts.creditors,
          debit: 0,
          credit: absAmount,
          partyType: "supplier",
          partyId: supplierId,
        },
      ]);
    } else {
      // Supplier advance / debit note: Dr 2010 (Creditors) / Cr 3999
      await tx.insert(schema.journalLines).values([
        {
          tenantId,
          entryId: journal.id,
          accountId: accounts.creditors,
          debit: absAmount,
          credit: 0,
          partyType: "supplier",
          partyId: supplierId,
        },
        {
          tenantId,
          entryId: journal.id,
          accountId: accounts.opening_balance_equity,
          debit: 0,
          credit: absAmount,
        },
      ]);
    }

    // 5. Update subledger opening balance
    await tx
      .update(schema.suppliers)
      .set({ openingBalance: amountPaise })
      .where(eq(schema.suppliers.id, supplierId));

    // 6. Record opening balance record
    const [record] = await tx
      .insert(schema.openingBalanceRecords)
      .values({
        tenantId,
        storeId: storeId || null,
        entityType: "supplier",
        entityId: supplierId,
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
      entityType: "supplier",
      entityId: supplierId,
      newValue: { journalEntryId: journal.id, amountPaise, asOfDate },
      reason: `Posted opening balance for supplier ${supplier.name}`,
    });

    return {
      recordId: record.id,
      journalEntryId: journal.id,
      alreadyPosted: false,
      status: "posted",
    };
  });
}
