import { and, eq, gte, lte } from "drizzle-orm";
import { format } from "date-fns";
import { schema, type DbOrTx, type Tx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { postPayment } from "./../payments";
import {
  RecordExpenseInputSchema,
  type RecordExpenseInput,
  type RecordExpenseResult,
} from "./types";

export async function recordExpense(
  tx: Tx,
  ctx: AuthCtx,
  rawInput: RecordExpenseInput,
): Promise<RecordExpenseResult> {
  const input = RecordExpenseInputSchema.parse(rawInput);
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new DomainError("INVALID_PAYMENT", "The amount must be a safe positive integer in paise.");
  }
  const today = format(new Date(), "yyyy-MM-dd");
  if (input.paymentDate > today) {
    throw new DomainError("INVALID_PAYMENT", "The payment date cannot be in the future.");
  }

  // 1. Idempotency verification
  const [existing] = await tx
    .select({
      id: schema.payments.id,
      paymentNo: schema.payments.paymentNo,
      amount: schema.payments.amount,
      expenseAccountId: schema.payments.expenseAccountId,
    })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.tenantId, ctx.tenantId),
        eq(schema.payments.clientOperationId, input.clientOperationId),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.amount !== input.amount || existing.expenseAccountId !== input.expenseAccountId) {
      throw new DomainError("IDEMPOTENCY_CONFLICT", "A voucher with this operation ID already exists with different details.");
    }
    return { paymentId: existing.id, paymentNo: existing.paymentNo, isDuplicate: true };
  }

  // 2. Validate expense account
  const [expAccount] = await tx
    .select({ id: schema.accounts.id, name: schema.accounts.name, isActive: schema.accounts.isActive, type: schema.accounts.type })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, ctx.tenantId), eq(schema.accounts.id, input.expenseAccountId)))
    .limit(1);

  if (!expAccount || expAccount.type !== "expense" || !expAccount.isActive) {
    throw new DomainError("INVALID_ACCOUNT", "Selected expense category is inactive or invalid.");
  }

  // 3. Revalidate store
  const [store] = await tx
    .select({ id: schema.stores.id, isActive: schema.stores.isActive })
    .from(schema.stores)
    .where(and(eq(schema.stores.tenantId, ctx.tenantId), eq(schema.stores.id, ctx.storeId)))
    .limit(1);

  if (!store || !store.isActive) {
    throw new DomainError("INVALID_STORE", "Selected store is inactive or not found.");
  }

  // 4. Till Payout linkage & lock
  let cashSessionId: string | null = null;
  if (input.paidFromTill) {
    if (input.method !== "cash") {
      throw new DomainError("INVALID_PAYMENT", "Till payouts are only valid for cash payments.");
    }
    const [openSession] = await tx
      .select({ id: schema.cashSessions.id })
      .from(schema.cashSessions)
      .where(
        and(
          eq(schema.cashSessions.tenantId, ctx.tenantId),
          eq(schema.cashSessions.storeId, ctx.storeId),
          eq(schema.cashSessions.status, "open"),
        ),
      )
      .for("update");

    if (!openSession) {
      throw new DomainError("CASH_SESSION_CLOSED", "Active cash register shift required for till payouts.");
    }
    cashSessionId = openSession.id;
  }

  // 5. Atomic PostPayment execution
  const result = await postPayment(tx, ctx, {
    direction: "out",
    partyType: "expense",
    expenseAccountId: input.expenseAccountId,
    method: input.method,
    amount: input.amount,
    paymentDate: input.paymentDate,
    reference: input.reference,
    note: input.note,
    clientOperationId: input.clientOperationId,
    cashSessionId: cashSessionId ?? undefined,
    paidFromTill: input.paidFromTill,
    payeeName: input.payeeName,
    vendorInvoiceNo: input.vendorInvoiceNo,
    vendorInvoiceDate: input.vendorInvoiceDate,
    vendorGstin: input.vendorGstin,
  });

  // 6. Record immutable cash_movements row if till payout
  if (input.paidFromTill && cashSessionId) {
    await tx.insert(schema.cashMovements).values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      cashSessionId,
      movementType: "cash_payout",
      direction: "out",
      amount: input.amount,
      paymentId: result.paymentId,
      notes: input.note || (input.payeeName ? `Expense paid to ${input.payeeName}` : "Expense payout"),
      createdBy: ctx.userId,
    });
  }

  await writeAudit(tx, ctx, {
    action: "create",
    entityType: "payment",
    entityId: result.paymentId,
    newValue: {
      paymentNo: result.paymentNo,
      category: expAccount.name,
      amount: input.amount,
      method: input.method,
      paidFromTill: input.paidFromTill,
      cashSessionId,
    },
  });

  return result;
}

export async function createExpenseAccount(
  db: DbOrTx,
  ctx: AuthCtx,
  input: { name: string; code?: string },
) {
  const trimmedName = input.name.trim();
  if (!trimmedName || trimmedName.length < 2) {
    throw new DomainError("INVALID_INPUT", "Category name must be at least 2 characters.");
  }

  // Name uniqueness check
  const [existingName] = await db
    .select({ id: schema.accounts.id })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, ctx.tenantId), eq(schema.accounts.name, trimmedName)))
    .limit(1);
  if (existingName) {
    throw new DomainError("DUPLICATE_NAME", "An account with this name already exists.");
  }

  let code = input.code?.trim();
  if (code) {
    const [existingCode] = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.tenantId, ctx.tenantId), eq(schema.accounts.code, code)))
      .limit(1);
    if (existingCode) {
      throw new DomainError("DUPLICATE_CODE", "An account with this code already exists.");
    }
  } else {
    // Allocate code in custom OpEx range 4160-4199
    const existingOpEx = await db
      .select({ code: schema.accounts.code })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.tenantId, ctx.tenantId),
          gte(schema.accounts.code, "4160"),
          lte(schema.accounts.code, "4199"),
        ),
      );
    const usedCodes = new Set(existingOpEx.map((a) => a.code));
    let nextCode = 4160;
    while (nextCode <= 4199 && usedCodes.has(String(nextCode))) {
      nextCode++;
    }
    if (nextCode > 4199) {
      throw new DomainError("CODE_EXHAUSTED", "Custom operational expense code range (4160-4199) exhausted.");
    }
    code = String(nextCode);
  }

  const [inserted] = await db
    .insert(schema.accounts)
    .values({
      tenantId: ctx.tenantId,
      code,
      name: trimmedName,
      type: "expense",
      isActive: true,
    })
    .returning();

  return inserted;
}
