import { and, desc, eq, inArray } from "drizzle-orm";
import { format } from "date-fns";
import type { DbOrTx, Tx } from "@/server/db";
import { schema } from "@/server/db";
import { nextDocNumber } from "./sequence";
import { assertAccountingPeriodOpen } from "./accounting-periods";
import { getOrSeedAccounts } from "./accounting";

export interface ManualJournalLineInput {
  accountId: string;
  debitPaise: number;
  creditPaise: number;
  partyType?: "customer" | "supplier" | null;
  partyId?: string | null;
}

export interface PostManualJournalParams {
  tx: Tx;
  tenantId: string;
  storeId: string;
  entryDate: string; // YYYY-MM-DD
  narration: string;
  lines: ManualJournalLineInput[];
  createdBy: string;
}

export interface PostContraParams {
  tx: Tx;
  tenantId: string;
  storeId: string;
  entryDate: string; // YYYY-MM-DD
  direction: "cash_to_bank" | "bank_to_cash" | "custom";
  fromAccountId?: string;
  toAccountId?: string;
  amountPaise: number;
  narration?: string;
  referenceNo?: string;
  createdBy: string;
}

export interface PostStandaloneNoteParams {
  tx: Tx;
  tenantId: string;
  storeId: string;
  entryDate: string; // YYYY-MM-DD
  noteType: "debit_note" | "credit_note";
  partyType: "customer" | "supplier";
  partyId: string;
  counterAccountId: string;
  amountPaise: number;
  narration: string;
  createdBy: string;
}

export function validateBalancedJournalLines(lines: ManualJournalLineInput[]): {
  totalDebit: number;
  totalCredit: number;
} {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("A journal voucher requires at least 2 lines.");
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of lines) {
    const debit = Math.round(Number(line.debitPaise) || 0);
    const credit = Math.round(Number(line.creditPaise) || 0);
    if (debit < 0 || credit < 0) {
      throw new Error("Debit and credit amounts must be non-negative.");
    }
    if (debit === 0 && credit === 0) {
      throw new Error("Each journal line must have a non-zero debit or credit.");
    }
    if (debit > 0 && credit > 0) {
      throw new Error("A single journal line cannot have both debit and credit.");
    }
    if (!line.accountId) {
      throw new Error("Every journal line must specify an account.");
    }
    totalDebit += debit;
    totalCredit += credit;
  }

  if (totalDebit <= 0 || totalDebit !== totalCredit) {
    throw new Error(
      `Journal entry is unbalanced (Debit: ₹${(totalDebit / 100).toFixed(2)}, Credit: ₹${(totalCredit / 100).toFixed(2)}).`,
    );
  }

  return { totalDebit, totalCredit };
}

export async function postManualJournalVoucher(params: PostManualJournalParams): Promise<{
  entryId: string;
  entryNo: string;
}> {
  const { tx, tenantId, storeId, entryDate, narration, lines, createdBy } = params;

  if (!narration?.trim()) {
    throw new Error("Narration is required for a journal voucher.");
  }
  validateBalancedJournalLines(lines);
  await assertAccountingPeriodOpen(tx, { tenantId, entryDate, storeId });

  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const validAccounts = await tx
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, tenantId), inArray(schema.accounts.id, accountIds)));

  if (validAccounts.length !== accountIds.length) {
    throw new Error("One or more selected ledger accounts were not found.");
  }

  const entryNo = await nextDocNumber(tx, tenantId, storeId, "journal_voucher", "JV");

  const [entry] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId,
      entryNo,
      entryDate,
      narration: narration.trim(),
      refType: "journal_voucher",
      createdBy,
    })
    .returning({ id: schema.journalEntries.id });

  await tx.insert(schema.journalLines).values(
    lines.map((l) => ({
      tenantId,
      entryId: entry.id,
      accountId: l.accountId,
      debit: Math.round(l.debitPaise),
      credit: Math.round(l.creditPaise),
      partyType: l.partyType ?? null,
      partyId: l.partyId ?? null,
    })),
  );

  return { entryId: entry.id, entryNo };
}

export async function postContraVoucher(params: PostContraParams): Promise<{
  entryId: string;
  entryNo: string;
}> {
  const { tx, tenantId, storeId, entryDate, direction, amountPaise, referenceNo, createdBy } = params;
  const amount = Math.round(amountPaise);
  if (amount <= 0) {
    throw new Error("Contra transfer amount must be greater than zero.");
  }

  await assertAccountingPeriodOpen(tx, { tenantId, entryDate, storeId });
  const accounts = await getOrSeedAccounts(tx, tenantId);

  let fromAccountId = params.fromAccountId;
  let toAccountId = params.toAccountId;

  if (direction === "cash_to_bank") {
    fromAccountId = fromAccountId || accounts.cash;
    toAccountId = toAccountId || accounts.bank;
  } else if (direction === "bank_to_cash") {
    fromAccountId = fromAccountId || accounts.bank;
    toAccountId = toAccountId || accounts.cash;
  }

  if (!fromAccountId || !toAccountId) {
    throw new Error("Both source and destination cash/bank accounts are required.");
  }
  if (fromAccountId === toAccountId) {
    throw new Error("Source and destination accounts cannot be the same.");
  }

  const defaultNarration =
    direction === "cash_to_bank"
      ? "Cash deposited into bank"
      : direction === "bank_to_cash"
        ? "Cash withdrawn from bank"
        : "Contra cash/bank transfer";

  const fullNarration = [params.narration?.trim() || defaultNarration, referenceNo?.trim() ? `Ref: ${referenceNo.trim()}` : ""]
    .filter(Boolean)
    .join(" · ");

  const entryNo = await nextDocNumber(tx, tenantId, storeId, "contra", "CV");

  const [entry] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId,
      entryNo,
      entryDate,
      narration: fullNarration,
      refType: "contra",
      createdBy,
    })
    .returning({ id: schema.journalEntries.id });

  await tx.insert(schema.journalLines).values([
    {
      tenantId,
      entryId: entry.id,
      accountId: toAccountId,
      debit: amount,
      credit: 0,
    },
    {
      tenantId,
      entryId: entry.id,
      accountId: fromAccountId,
      debit: 0,
      credit: amount,
    },
  ]);

  return { entryId: entry.id, entryNo };
}

export async function postStandaloneNote(params: PostStandaloneNoteParams): Promise<{
  entryId: string;
  entryNo: string;
}> {
  const { tx, tenantId, storeId, entryDate, noteType, partyType, partyId, counterAccountId, amountPaise, narration, createdBy } =
    params;

  const amount = Math.round(amountPaise);
  if (amount <= 0) {
    throw new Error("Note amount must be greater than zero.");
  }
  if (!narration?.trim()) {
    throw new Error("Narration / reason is required for a Debit or Credit Note.");
  }
  if (!partyId || !counterAccountId) {
    throw new Error("Party and counter ledger account are required.");
  }

  await assertAccountingPeriodOpen(tx, { tenantId, entryDate, storeId });
  const accounts = await getOrSeedAccounts(tx, tenantId);

  const partyControlAccountId = partyType === "customer" ? accounts.debtors : accounts.creditors;
  if (!partyControlAccountId) {
    throw new Error(`Missing control account for ${partyType}.`);
  }

  const prefix = noteType === "debit_note" ? "DN" : "CN";
  const entryNo = await nextDocNumber(tx, tenantId, storeId, noteType, prefix);

  // Debit Note on Customer -> increases receivable (Dr Debtors, Cr Counter)
  // Credit Note on Customer -> decreases receivable (Dr Counter, Cr Debtors)
  // Debit Note on Supplier -> decreases payable (Dr Creditors, Cr Counter)
  // Credit Note on Supplier -> increases payable (Dr Counter, Cr Creditors)
  const isDebitPartyControl = noteType === "debit_note";

  const [entry] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId,
      entryNo,
      entryDate,
      narration: narration.trim(),
      refType: noteType,
      refId: partyId,
      createdBy,
    })
    .returning({ id: schema.journalEntries.id });

  await tx.insert(schema.journalLines).values([
    {
      tenantId,
      entryId: entry.id,
      accountId: partyControlAccountId,
      debit: isDebitPartyControl ? amount : 0,
      credit: isDebitPartyControl ? 0 : amount,
      partyType,
      partyId,
    },
    {
      tenantId,
      entryId: entry.id,
      accountId: counterAccountId,
      debit: isDebitPartyControl ? 0 : amount,
      credit: isDebitPartyControl ? amount : 0,
    },
  ]);

  return { entryId: entry.id, entryNo };
}

export async function listManualVouchers(tx: DbOrTx, tenantId: string, storeId: string, limit = 50) {
  const entries = await tx
    .select()
    .from(schema.journalEntries)
    .where(
      and(
        eq(schema.journalEntries.tenantId, tenantId),
        eq(schema.journalEntries.storeId, storeId),
        inArray(schema.journalEntries.refType, ["journal_voucher", "contra", "debit_note", "credit_note"]),
      ),
    )
    .orderBy(desc(schema.journalEntries.entryDate), desc(schema.journalEntries.createdAt))
    .limit(limit);

  if (entries.length === 0) return [];

  const lines = await tx
    .select({
      entryId: schema.journalLines.entryId,
      accountName: schema.accounts.name,
      accountCode: schema.accounts.code,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
      partyType: schema.journalLines.partyType,
    })
    .from(schema.journalLines)
    .innerJoin(schema.accounts, eq(schema.journalLines.accountId, schema.accounts.id))
    .where(
      and(
        eq(schema.journalLines.tenantId, tenantId),
        inArray(
          schema.journalLines.entryId,
          entries.map((e) => e.id),
        ),
      ),
    );

  const linesByEntry = new Map<string, typeof lines>();
  for (const line of lines) {
    const arr = linesByEntry.get(line.entryId) ?? [];
    arr.push(line);
    linesByEntry.set(line.entryId, arr);
  }

  return entries.map((e) => {
    const entryLines = linesByEntry.get(e.id) ?? [];
    const totalAmount = entryLines.reduce((sum, l) => sum + (l.debit || 0), 0);
    return {
      ...e,
      entryDateFormatted: format(new Date(e.entryDate), "dd MMM yyyy"),
      totalAmount,
      lines: entryLines,
    };
  });
}

/**
 * Posts GST Input Tax Credit (ITC) reversal on destroyed / expired written-off stock (CGST s.17(5)(h), A9.6/G8).
 */
export async function postItcReversalJournalEntry(params: {
  tx: Tx;
  tenantId: string;
  storeId: string;
  entryDate: string;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  narration: string;
  createdBy: string;
}): Promise<{ entryId: string; entryNo: string }> {
  const totalItc = Math.round(params.cgstPaise + params.sgstPaise + params.igstPaise);
  if (totalItc <= 0) {
    throw new Error("Total ITC to reverse must be greater than zero.");
  }

  await assertAccountingPeriodOpen(params.tx, {
    tenantId: params.tenantId,
    entryDate: params.entryDate,
    storeId: params.storeId,
  });

  const accounts = await getOrSeedAccounts(params.tx, params.tenantId);
  const lossAccId = accounts.stock_loss;
  if (!lossAccId) throw new Error("Stock Shortage & Loss account is missing.");

  const entryNo = await nextDocNumber(params.tx, params.tenantId, params.storeId, "itc_reversal", "ITCR");
  const [entry] = await params.tx
    .insert(schema.journalEntries)
    .values({
      tenantId: params.tenantId,
      storeId: params.storeId,
      entryNo,
      entryDate: params.entryDate,
      narration: params.narration.trim() || "ITC reversal u/s 17(5)(h) on expired/written-off stock",
      refType: "itc_reversal",
      createdBy: params.createdBy,
    })
    .returning({ id: schema.journalEntries.id });

  const jLines: Array<{ tenantId: string; entryId: string; accountId: string; debit: number; credit: number }> = [
    { tenantId: params.tenantId, entryId: entry.id, accountId: lossAccId, debit: totalItc, credit: 0 },
  ];
  if (params.cgstPaise > 0 && accounts.cgst_input) {
    jLines.push({ tenantId: params.tenantId, entryId: entry.id, accountId: accounts.cgst_input, debit: 0, credit: Math.round(params.cgstPaise) });
  }
  if (params.sgstPaise > 0 && accounts.sgst_input) {
    jLines.push({ tenantId: params.tenantId, entryId: entry.id, accountId: accounts.sgst_input, debit: 0, credit: Math.round(params.sgstPaise) });
  }
  if (params.igstPaise > 0 && accounts.igst_input) {
    jLines.push({ tenantId: params.tenantId, entryId: entry.id, accountId: accounts.igst_input, debit: 0, credit: Math.round(params.igstPaise) });
  }

  await params.tx.insert(schema.journalLines).values(jLines);
  return { entryId: entry.id, entryNo };
}
