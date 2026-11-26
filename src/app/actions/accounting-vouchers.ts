"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { getOrSeedAccounts } from "@/server/domain/accounting";
import {
  listManualVouchers,
  postContraVoucher,
  postManualJournalVoucher,
  postStandaloneNote,
} from "@/server/domain/accounting-vouchers";

export async function getVoucherFormDataAction() {
  const ctx = await requirePermission("accounting.view");

  await getOrSeedAccounts(db, ctx.tenantId);

  const [accounts, customers, suppliers, recentVouchers] = await Promise.all([
    db
      .select({
        id: schema.accounts.id,
        code: schema.accounts.code,
        name: schema.accounts.name,
        type: schema.accounts.type,
        systemKey: schema.accounts.systemKey,
      })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.tenantId, ctx.tenantId), eq(schema.accounts.isActive, true)))
      .orderBy(asc(schema.accounts.code)),
    db
      .select({ id: schema.customers.id, name: schema.customers.name, phone: schema.customers.phone })
      .from(schema.customers)
      .where(eq(schema.customers.tenantId, ctx.tenantId))
      .orderBy(asc(schema.customers.name))
      .limit(300),
    db
      .select({ id: schema.suppliers.id, name: schema.suppliers.name })
      .from(schema.suppliers)
      .where(eq(schema.suppliers.tenantId, ctx.tenantId))
      .orderBy(asc(schema.suppliers.name))
      .limit(300),
    listManualVouchers(db, ctx.tenantId, ctx.storeId, 30),
  ]);

  return { accounts, customers, suppliers, recentVouchers };
}

export async function postManualJournalAction(input: {
  entryDate: string;
  narration: string;
  lines: Array<{
    accountId: string;
    debitPaise: number;
    creditPaise: number;
    partyType?: "customer" | "supplier" | null;
    partyId?: string | null;
  }>;
}): Promise<{ success: boolean; entryNo?: string; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.post");
    const result = await db.transaction((tx) =>
      postManualJournalVoucher({
        tx,
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        entryDate: input.entryDate,
        narration: input.narration,
        lines: input.lines,
        createdBy: ctx.userId,
      }),
    );
    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard/accounting/vouchers");
    revalidatePath("/dashboard/accounting/day-book");
    return { success: true, entryNo: result.entryNo };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to post journal voucher" };
  }
}

export async function postContraVoucherAction(input: {
  entryDate: string;
  direction: "cash_to_bank" | "bank_to_cash" | "custom";
  fromAccountId?: string;
  toAccountId?: string;
  amountPaise: number;
  narration?: string;
  referenceNo?: string;
}): Promise<{ success: boolean; entryNo?: string; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.post");
    const result = await db.transaction((tx) =>
      postContraVoucher({
        tx,
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        entryDate: input.entryDate,
        direction: input.direction,
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        amountPaise: input.amountPaise,
        narration: input.narration,
        referenceNo: input.referenceNo,
        createdBy: ctx.userId,
      }),
    );
    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard/accounting/vouchers");
    revalidatePath("/dashboard/accounting/day-book");
    return { success: true, entryNo: result.entryNo };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to post contra voucher" };
  }
}

export async function postStandaloneNoteAction(input: {
  entryDate: string;
  noteType: "debit_note" | "credit_note";
  partyType: "customer" | "supplier";
  partyId: string;
  counterAccountId: string;
  amountPaise: number;
  narration: string;
}): Promise<{ success: boolean; entryNo?: string; error?: string }> {
  try {
    const ctx = await requirePermission("accounting.post");
    const result = await db.transaction((tx) =>
      postStandaloneNote({
        tx,
        tenantId: ctx.tenantId,
        storeId: ctx.storeId,
        entryDate: input.entryDate,
        noteType: input.noteType,
        partyType: input.partyType,
        partyId: input.partyId,
        counterAccountId: input.counterAccountId,
        amountPaise: input.amountPaise,
        narration: input.narration,
        createdBy: ctx.userId,
      }),
    );
    revalidatePath("/dashboard/accounting");
    revalidatePath("/dashboard/accounting/vouchers");
    revalidatePath("/dashboard/accounting/day-book");
    return { success: true, entryNo: result.entryNo };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to post note" };
  }
}
