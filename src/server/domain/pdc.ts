import { and, desc, eq } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/server/db";
import { schema } from "@/server/db";
import { getOrSeedAccounts } from "./accounting";
import { assertAccountingPeriodOpen } from "./accounting-periods";
import { nextDocNumber } from "./sequence";

export interface RegisterPdcInput {
  tx: DbOrTx;
  tenantId: string;
  storeId: string;
  direction: "inward" | "outward";
  partyType: "customer" | "supplier";
  partyId?: string | null;
  partyName: string;
  chequeNo: string;
  chequeDate: string; // YYYY-MM-DD
  bankName: string;
  amountPaise: number;
  createdBy: string;
}

export async function registerPdcCheque(input: RegisterPdcInput) {
  if (input.amountPaise <= 0) throw new Error("Cheque amount must be greater than zero.");
  if (!input.chequeNo.trim()) throw new Error("Cheque number is required.");

  const [created] = await input.tx
    .insert(schema.pdcCheques)
    .values({
      tenantId: input.tenantId,
      storeId: input.storeId,
      direction: input.direction,
      partyType: input.partyType,
      partyId: input.partyId ?? null,
      partyName: input.partyName.trim(),
      chequeNo: input.chequeNo.trim(),
      chequeDate: input.chequeDate,
      bankName: input.bankName.trim(),
      amount: Math.round(input.amountPaise),
      status: "pending",
      createdBy: input.createdBy,
    })
    .returning();

  return created;
}

export async function depositPdcCheque(params: {
  tx: DbOrTx;
  tenantId: string;
  pdcId: string;
  payInSlipNo: string;
  depositedAt: string;
}) {
  const [cheque] = await params.tx
    .select()
    .from(schema.pdcCheques)
    .where(and(eq(schema.pdcCheques.id, params.pdcId), eq(schema.pdcCheques.tenantId, params.tenantId)))
    .limit(1);

  if (!cheque) throw new Error("PDC record not found.");
  if (cheque.status !== "pending") throw new Error(`Cannot deposit cheque in "${cheque.status}" state.`);

  await params.tx
    .update(schema.pdcCheques)
    .set({
      status: "deposited",
      payInSlipNo: params.payInSlipNo.trim() || "SLIP",
      depositedAt: params.depositedAt,
    })
    .where(eq(schema.pdcCheques.id, cheque.id));
}

export async function clearPdcCheque(params: {
  tx: Tx;
  tenantId: string;
  storeId: string;
  pdcId: string;
  clearedAt: string;
  userId: string;
}) {
  const [cheque] = await params.tx
    .select()
    .from(schema.pdcCheques)
    .where(and(eq(schema.pdcCheques.id, params.pdcId), eq(schema.pdcCheques.tenantId, params.tenantId)))
    .for("update")
    .limit(1);

  if (!cheque) throw new Error("PDC record not found.");
  if (cheque.status !== "pending" && cheque.status !== "deposited") {
    throw new Error(`Cannot clear cheque in "${cheque.status}" state.`);
  }

  await assertAccountingPeriodOpen(params.tx, {
    tenantId: params.tenantId,
    entryDate: params.clearedAt,
    storeId: params.storeId,
  });

  const accounts = await getOrSeedAccounts(params.tx, params.tenantId);
  const bankId = accounts.bank;
  const partyControlId = cheque.direction === "inward" ? accounts.debtors : accounts.creditors;

  if (!bankId || !partyControlId) {
    throw new Error("Required Bank / Debtors / Creditors accounts are missing.");
  }

  const entryNo = await nextDocNumber(params.tx, params.tenantId, params.storeId, "pdc_clear", "PDC");
  const [entry] = await params.tx
    .insert(schema.journalEntries)
    .values({
      tenantId: params.tenantId,
      storeId: params.storeId,
      entryNo,
      entryDate: params.clearedAt,
      narration: `PDC Cleared (${cheque.chequeNo} · ${cheque.bankName}) — ${cheque.partyName}`,
      refType: cheque.direction === "inward" ? "receipt" : "payment",
      refId: cheque.id,
      createdBy: params.userId,
    })
    .returning({ id: schema.journalEntries.id });

  if (cheque.direction === "inward") {
    await params.tx.insert(schema.journalLines).values([
      { tenantId: params.tenantId, entryId: entry.id, accountId: bankId, debit: cheque.amount, credit: 0 },
      {
        tenantId: params.tenantId,
        entryId: entry.id,
        accountId: partyControlId,
        debit: 0,
        credit: cheque.amount,
        partyType: cheque.partyType,
        partyId: cheque.partyId,
      },
    ]);
  } else {
    await params.tx.insert(schema.journalLines).values([
      {
        tenantId: params.tenantId,
        entryId: entry.id,
        accountId: partyControlId,
        debit: cheque.amount,
        credit: 0,
        partyType: cheque.partyType,
        partyId: cheque.partyId,
      },
      { tenantId: params.tenantId, entryId: entry.id, accountId: bankId, debit: 0, credit: cheque.amount },
    ]);
  }

  await params.tx
    .update(schema.pdcCheques)
    .set({
      status: "cleared",
      clearedAt: params.clearedAt,
      journalEntryId: entry.id,
    })
    .where(eq(schema.pdcCheques.id, cheque.id));

  return { entryId: entry.id, entryNo };
}

export async function dishonourPdcCheque(params: {
  tx: DbOrTx;
  tenantId: string;
  pdcId: string;
  reason: string;
}) {
  const [cheque] = await params.tx
    .select()
    .from(schema.pdcCheques)
    .where(and(eq(schema.pdcCheques.id, params.pdcId), eq(schema.pdcCheques.tenantId, params.tenantId)))
    .limit(1);

  if (!cheque) throw new Error("PDC record not found.");
  if (cheque.status === "cleared") {
    throw new Error("Cleared cheques cannot be marked dishonoured directly; pass a reversal entry.");
  }

  await params.tx
    .update(schema.pdcCheques)
    .set({
      status: "dishonoured",
      dishonourReason: params.reason.trim() || "Cheque dishonoured / bounced",
    })
    .where(eq(schema.pdcCheques.id, cheque.id));
}

export async function listPdcCheques(db: DbOrTx, tenantId: string, storeId: string) {
  return db
    .select()
    .from(schema.pdcCheques)
    .where(and(eq(schema.pdcCheques.tenantId, tenantId), eq(schema.pdcCheques.storeId, storeId)))
    .orderBy(desc(schema.pdcCheques.chequeDate), desc(schema.pdcCheques.createdAt))
    .limit(100);
}
