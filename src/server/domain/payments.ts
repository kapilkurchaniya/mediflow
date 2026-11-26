import { z } from "zod";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { format } from "date-fns";
import { schema, type DbOrTx, type Tx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { formatINR } from "@/lib/format";
import { getOrSeedAccounts } from "./accounting";
import { nextDocNumber } from "./sequence";
import { assertAccountingPeriodOpen } from "./accounting-periods";

/**
 * 🤝 CONTRACT (ROADMAP A2.9): receipts and payment vouchers.
 * Lane B builds supplier payments (B2.4) on top of `postPayment`; bank reconciliation matches its rows.
 * Money is integer paise.
 */

export const POST_PAYMENT_METHODS = ["cash", "upi", "card", "bank", "cheque", "neft", "rtgs"] as const;

export const PostPaymentInput = z.object({
  /** in = we receive (customer receipt), out = we pay (supplier payment, expense). */
  direction: z.enum(["in", "out"]),
  partyType: z.enum(["customer", "supplier", "expense"]),
  partyId: z.string().uuid().optional(),
  /** Required when partyType is "expense": the expense account to debit. */
  expenseAccountId: z.string().uuid().optional(),
  method: z.enum(POST_PAYMENT_METHODS),
  /** paise */
  amount: z.number().int().positive(),
  reference: z.string().trim().max(64).optional(),
  /** YYYY-MM-DD business date. */
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(500).optional(),
  /** Bill-wise settlement: which invoices this payment pays off. The allocations must sum to <= amount. */
  allocations: z
    .array(
      z.object({
        refType: z.enum(["sale", "purchase"]),
        refId: z.string().uuid(),
        /** paise */
        amount: z.number().int().positive(),
      }),
    )
    .optional(),
  clientOperationId: z.string().uuid().optional(),
  cashSessionId: z.string().uuid().optional(),
  paidFromTill: z.boolean().optional(),
  payeeName: z.string().trim().max(255).optional(),
  vendorInvoiceNo: z.string().trim().max(100).optional(),
  vendorInvoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  vendorGstin: z.string().trim().max(20).optional(),
});
export type PostPaymentInput = z.infer<typeof PostPaymentInput>;

export interface PostPaymentResult {
  paymentId: string;
  paymentNo: string;
}

/**
 * Creates the `payments` row (number from `nextDocNumber`), a balanced journal entry
 * (receipt: Dr Cash/Bank, Cr Customer; supplier payment: Dr Supplier, Cr Cash/Bank; expense: Dr Expense,
 * Cr Cash/Bank) and settles the allocated bills (`sales.paid_amount` / `credit_amount`,
 * `purchases.paid_amount`). Whatever is not allocated stays on the party's account (an advance).
 * Must run inside the caller's transaction. Throws DomainError for expected failures.
 *
 * Allowed combinations: customer receipt (in), supplier payment (out), expense payment (out).
 */
export async function postPayment(tx: Tx, ctx: AuthCtx, input: PostPaymentInput): Promise<PostPaymentResult> {
  const now = new Date();
  const combo = `${input.direction}:${input.partyType}`;
  if (!["in:customer", "out:supplier", "out:expense"].includes(combo)) {
    throw new DomainError("INVALID_PAYMENT", "A payment must be a receipt from a customer, or a payment to a supplier or an expense.");
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new DomainError("INVALID_PAYMENT", "The amount must be more than zero.");
  }
  if (input.paymentDate > format(now, "yyyy-MM-dd")) {
    throw new DomainError("INVALID_PAYMENT", "The payment date cannot be in the future.");
  }
  if (input.partyType !== "expense" && !input.partyId) {
    throw new DomainError("INVALID_PAYMENT", `Choose the ${input.partyType}.`);
  }
  if (input.partyType === "expense" && !input.expenseAccountId) {
    throw new DomainError("INVALID_PAYMENT", "Choose the expense account.");
  }

  const allocations = input.allocations ?? [];
  const wantRef = input.partyType === "customer" ? "sale" : "purchase";
  if (allocations.length > 0 && input.partyType === "expense") {
    throw new DomainError("INVALID_PAYMENT", "An expense payment cannot be allocated to bills.");
  }
  if (new Set(allocations.map((a) => a.refId)).size !== allocations.length) {
    throw new DomainError("INVALID_PAYMENT", "The same bill is listed twice.");
  }
  if (allocations.some((a) => a.refType !== wantRef || !Number.isInteger(a.amount) || a.amount <= 0)) {
    throw new DomainError("INVALID_PAYMENT", `A ${input.partyType} payment can only settle ${wantRef} bills, with amounts above zero.`);
  }
  const allocated = allocations.reduce((sum, a) => sum + a.amount, 0);
  if (allocated > input.amount) {
    throw new DomainError("INVALID_PAYMENT", `The bills add up to ${formatINR(allocated)}, more than the ${formatINR(input.amount)} paid.`);
  }

  // ── The other side of the payment (tenant-scoped) ───────────────────────────────────────────────
  let partyName = "";
  if (input.partyType === "customer") {
    const [c] = await tx
      .select({ name: schema.customers.name })
      .from(schema.customers)
      .where(and(eq(schema.customers.id, input.partyId!), eq(schema.customers.tenantId, ctx.tenantId)));
    if (!c) throw new DomainError("NOT_FOUND", "Customer not found.");
    partyName = c.name;
  } else if (input.partyType === "supplier") {
    const [sup] = await tx
      .select({ name: schema.suppliers.name })
      .from(schema.suppliers)
      .where(and(eq(schema.suppliers.id, input.partyId!), eq(schema.suppliers.tenantId, ctx.tenantId)));
    if (!sup) throw new DomainError("NOT_FOUND", "Supplier not found.");
    partyName = sup.name;
  } else {
    const [acc] = await tx
      .select({ name: schema.accounts.name, type: schema.accounts.type })
      .from(schema.accounts)
      .where(and(eq(schema.accounts.id, input.expenseAccountId!), eq(schema.accounts.tenantId, ctx.tenantId)));
    if (!acc || acc.type !== "expense") throw new DomainError("NOT_FOUND", "Expense account not found.");
    partyName = acc.name;
  }

  // ── Lock and check the bills being settled (in deterministic ID order) ──────────────
  const sortedAllocations = [...allocations].sort((a, b) => a.refId.localeCompare(b.refId));
  for (const a of sortedAllocations) {
    if (a.refType === "sale") {
      const [sale] = await tx
        .select({ invoiceNo: schema.sales.invoiceNo, credit: schema.sales.creditAmount })
        .from(schema.sales)
        .where(
          and(
            eq(schema.sales.id, a.refId),
            eq(schema.sales.tenantId, ctx.tenantId),
            eq(schema.sales.storeId, ctx.storeId),
            eq(schema.sales.customerId, input.partyId!),
            eq(schema.sales.status, "completed"),
          ),
        )
        .for("update");
      if (!sale) throw new DomainError("NOT_FOUND", "That bill does not belong to this customer.");
      if (a.amount > (sale.credit ?? 0)) {
        throw new DomainError("OVER_ALLOCATED", `Bill ${sale.invoiceNo} has only ${formatINR(sale.credit ?? 0)} outstanding.`);
      }
    } else {
      const [p] = await tx
        .select({ invoiceNo: schema.purchases.supplierInvoiceNo, total: schema.purchases.totalAmount, paid: schema.purchases.paidAmount })
        .from(schema.purchases)
        .where(
          and(
            eq(schema.purchases.id, a.refId),
            eq(schema.purchases.tenantId, ctx.tenantId),
            eq(schema.purchases.storeId, ctx.storeId),
            eq(schema.purchases.supplierId, input.partyId!),
            eq(schema.purchases.status, "posted"),
          ),
        )
        .for("update");
      if (!p) throw new DomainError("NOT_FOUND", "That bill does not belong to this supplier.");
      const due = (p.total ?? 0) - (p.paid ?? 0);
      if (a.amount > due) throw new DomainError("OVER_ALLOCATED", `Bill ${p.invoiceNo} has only ${formatINR(due)} outstanding.`);
    }
  }

  // ── Number, payment row, journal ────────────────────────────────────────────────────────────────
  const isReceipt = input.direction === "in";
  const paymentNo = await nextDocNumber(tx, ctx.tenantId, ctx.storeId, isReceipt ? "payment_in" : "payment_out", isReceipt ? "RCT" : "PAY", now);

  let cashSessionId = input.cashSessionId || null;
  let paidFromTill = input.paidFromTill ?? false;

  // Auto-link legacy cash payouts if an open shift exists and not explicitly opted out
  if (input.direction === "out" && input.method === "cash" && input.paidFromTill === undefined && !cashSessionId) {
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
      .limit(1);
    if (openSession) {
      cashSessionId = openSession.id;
      paidFromTill = true;
    }
  }

  await assertAccountingPeriodOpen(tx, {
    tenantId: ctx.tenantId,
    entryDate: input.paymentDate,
    storeId: ctx.storeId,
  });

  const [payment] = await tx
    .insert(schema.payments)
    .values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      paymentNo,
      direction: input.direction,
      partyType: input.partyType,
      partyId: input.partyId ?? null,
      expenseAccountId: input.expenseAccountId ?? null,
      method: input.method,
      amount: input.amount,
      reference: input.reference || null,
      paymentDate: input.paymentDate,
      note: input.note || null,
      clientOperationId: input.clientOperationId || null,
      cashSessionId,
      paidFromTill,
      payeeName: input.payeeName || null,
      vendorInvoiceNo: input.vendorInvoiceNo || null,
      vendorInvoiceDate: input.vendorInvoiceDate || null,
      vendorGstin: input.vendorGstin || null,
      createdBy: ctx.userId,
    })
    .returning({ id: schema.payments.id });

  const accounts = await getOrSeedAccounts(tx, ctx.tenantId);
  const moneyAccount = input.method === "cash" ? accounts.cash : accounts.bank;
  const partyAccount =
    input.partyType === "customer" ? accounts.debtors : input.partyType === "supplier" ? accounts.creditors : input.expenseAccountId!;
  const journalNo = await nextDocNumber(tx, ctx.tenantId, ctx.storeId, "journal", "JV", now);
  const [entry] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      entryNo: journalNo,
      entryDate: input.paymentDate,
      narration: `${isReceipt ? "Receipt" : "Payment"} ${paymentNo} ${isReceipt ? "from" : "to"} ${partyName}`,
      refType: "payment",
      refId: payment.id,
      createdBy: ctx.userId,
    })
    .returning({ id: schema.journalEntries.id });

  const party = input.partyType === "expense" ? {} : { partyType: input.partyType, partyId: input.partyId };
  const line = (accountId: string, debit: number, credit: number, withParty: boolean) => ({
    tenantId: ctx.tenantId,
    entryId: entry.id,
    accountId,
    debit,
    credit,
    ...(withParty ? party : {}),
  });
  await tx.insert(schema.journalLines).values(
    isReceipt
      ? [line(moneyAccount, input.amount, 0, false), line(partyAccount, 0, input.amount, true)]
      : [line(partyAccount, input.amount, 0, input.partyType !== "expense"), line(moneyAccount, 0, input.amount, false)],
  );
  await tx.update(schema.payments).set({ journalEntryId: entry.id }).where(eq(schema.payments.id, payment.id));

  // ── Persist bill allocations & settle bills ────────────────────────────────────────────────
  if (sortedAllocations.length > 0) {
    await tx.insert(schema.paymentAllocations).values(
      sortedAllocations.map((a) => ({
        tenantId: ctx.tenantId,
        paymentId: payment.id,
        refType: a.refType,
        refId: a.refId,
        amount: a.amount,
      })),
    );
  }

  for (const a of sortedAllocations) {
    if (a.refType === "sale") {
      await tx
        .update(schema.sales)
        .set({
          paidAmount: sql`${schema.sales.paidAmount} + ${a.amount}`,
          creditAmount: sql`${schema.sales.creditAmount} - ${a.amount}`,
        })
        .where(eq(schema.sales.id, a.refId));
    } else {
      await tx
        .update(schema.purchases)
        .set({ paidAmount: sql`${schema.purchases.paidAmount} + ${a.amount}` })
        .where(eq(schema.purchases.id, a.refId));
    }
  }

  await writeAudit(tx, ctx, {
    action: "create",
    entityType: "payment",
    entityId: payment.id,
    newValue: {
      paymentNo,
      direction: input.direction,
      partyType: input.partyType,
      party: partyName,
      method: input.method,
      amount: input.amount,
      allocatedAmount: allocated,
      unallocatedAmount: input.amount - allocated,
      billsSettled: sortedAllocations.length,
    },
  });

  return { paymentId: payment.id, paymentNo };
}

/** Allocations made by a specific payment, with invoice / bill details. */
export async function getPaymentAllocations(
  database: DbOrTx,
  tenantId: string,
  paymentId: string,
) {
  return database
    .select({
      id: schema.paymentAllocations.id,
      paymentId: schema.paymentAllocations.paymentId,
      refType: schema.paymentAllocations.refType,
      refId: schema.paymentAllocations.refId,
      amount: schema.paymentAllocations.amount,
      createdAt: schema.paymentAllocations.createdAt,
    })
    .from(schema.paymentAllocations)
    .where(
      and(
        eq(schema.paymentAllocations.tenantId, tenantId),
        eq(schema.paymentAllocations.paymentId, paymentId),
      ),
    )
    .orderBy(schema.paymentAllocations.createdAt);
}

/** All payment allocations applied against a specific bill (sale or purchase). */
export async function getBillAllocations(
  database: DbOrTx,
  tenantId: string,
  refType: "sale" | "purchase",
  refId: string,
) {
  return database
    .select({
      id: schema.paymentAllocations.id,
      paymentId: schema.paymentAllocations.paymentId,
      paymentNo: schema.payments.paymentNo,
      paymentDate: schema.payments.paymentDate,
      method: schema.payments.method,
      reference: schema.payments.reference,
      amount: schema.paymentAllocations.amount,
      createdAt: schema.paymentAllocations.createdAt,
    })
    .from(schema.paymentAllocations)
    .innerJoin(
      schema.payments,
      eq(schema.paymentAllocations.paymentId, schema.payments.id),
    )
    .where(
      and(
        eq(schema.paymentAllocations.tenantId, tenantId),
        eq(schema.paymentAllocations.refType, refType),
        eq(schema.paymentAllocations.refId, refId),
      ),
    )
    .orderBy(schema.paymentAllocations.createdAt);
}

/** Customers who still owe money on completed bills of this store, biggest balance first. */
export async function listCustomersWithDue(database: DbOrTx, tenantId: string, storeId: string) {
  const rows = await database
    .select({
      id: schema.customers.id,
      name: schema.customers.name,
      phone: schema.customers.phone,
      due: sql<number>`sum(${schema.sales.creditAmount})::bigint`,
      bills: sql<number>`count(*)::int`,
    })
    .from(schema.sales)
    .innerJoin(schema.customers, eq(schema.sales.customerId, schema.customers.id))
    .where(
      and(
        eq(schema.sales.tenantId, tenantId),
        eq(schema.sales.storeId, storeId),
        eq(schema.sales.status, "completed"),
        gt(schema.sales.creditAmount, 0),
      ),
    )
    .groupBy(schema.customers.id, schema.customers.name, schema.customers.phone);
  return rows.map((r) => ({ ...r, due: Number(r.due) })).sort((a, b) => b.due - a.due);
}

/** A customer's unpaid bills, oldest first (the order a receipt should settle them). */
export async function listOpenBills(database: DbOrTx, tenantId: string, storeId: string, customerId: string) {
  return database
    .select({
      id: schema.sales.id,
      invoiceNo: schema.sales.invoiceNo,
      date: schema.sales.completedAt,
      total: schema.sales.totalAmount,
      paid: schema.sales.paidAmount,
      due: schema.sales.creditAmount,
    })
    .from(schema.sales)
    .where(
      and(
        eq(schema.sales.tenantId, tenantId),
        eq(schema.sales.storeId, storeId),
        eq(schema.sales.customerId, customerId),
        eq(schema.sales.status, "completed"),
        gt(schema.sales.creditAmount, 0),
      ),
    )
    .orderBy(schema.sales.completedAt);
}

/** Latest receipts (direction "in") or payments (direction "out") of this store. */
export async function listRecentPayments(
  database: DbOrTx,
  tenantId: string,
  storeId: string,
  direction: "in" | "out",
  limit = 20,
) {
  const rows = await database
    .select({
      id: schema.payments.id,
      paymentNo: schema.payments.paymentNo,
      paymentDate: schema.payments.paymentDate,
      method: schema.payments.method,
      amount: schema.payments.amount,
      reference: schema.payments.reference,
      partyType: schema.payments.partyType,
      partyId: schema.payments.partyId,
      customerName: schema.customers.name,
      supplierName: schema.suppliers.name,
    })
    .from(schema.payments)
    .leftJoin(
      schema.customers,
      and(
        eq(schema.payments.partyId, schema.customers.id),
        eq(schema.payments.partyType, "customer"),
      ),
    )
    .leftJoin(
      schema.suppliers,
      and(
        eq(schema.payments.partyId, schema.suppliers.id),
        eq(schema.payments.partyType, "supplier"),
      ),
    )
    .where(
      and(
        eq(schema.payments.tenantId, tenantId),
        eq(schema.payments.storeId, storeId),
        eq(schema.payments.direction, direction),
      ),
    )
    .orderBy(desc(schema.payments.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    paymentNo: r.paymentNo,
    paymentDate: r.paymentDate,
    method: r.method,
    amount: r.amount,
    reference: r.reference,
    partyName:
      r.partyType === "customer"
        ? r.customerName
        : r.partyType === "supplier"
        ? r.supplierName
        : "Expense",
  }));
}
