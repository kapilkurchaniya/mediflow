import { schema, type Tx, type DbOrTx } from "@/server/db";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { DomainError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { nextDocNumber } from "@/server/domain/sequence";
import { getOrSeedAccounts } from "@/server/domain/accounting";
import type { AuthCtx } from "@/server/rbac";
import { z } from "zod";

export const RecordSupplierPaymentSchema = z.object({
  supplierId: z.string().uuid("Invalid supplier ID"),
  amount: z.number().int().positive("Payment amount must be greater than zero"),
  method: z.enum(["cash", "upi", "bank", "card"]),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Payment date must be YYYY-MM-DD"),
  reference: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
  purchaseId: z.string().uuid().optional(), // optional specific invoice allocation
});

export type RecordSupplierPaymentInput = z.infer<typeof RecordSupplierPaymentSchema>;

export interface SupplierLedgerEntry {
  id: string;
  date: string;
  type: "opening" | "purchase" | "purchase_return" | "payment";
  voucherNo: string;
  referenceNo: string | null;
  description: string;
  debit: number; // in paise: reduces payable (returns, payments)
  credit: number; // in paise: increases payable (purchases, opening balance)
  balance: number; // running net payable in paise (positive = we owe supplier)
}

export interface SupplierLedgerSummary {
  supplier: {
    id: string;
    name: string;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    stateCode: string | null;
    drugLicenseNo: string | null;
    address: string | null;
    creditDays: number;
    leadTimeDays: number;
    openingBalance: number;
    isActive: boolean;
  };
  period: {
    startDate?: string;
    endDate?: string;
  };
  openingBalance: number;
  totalPurchases: number;
  totalReturns: number;
  totalPayments: number;
  closingBalance: number;
  entries: SupplierLedgerEntry[];
}

/**
 * Computes a supplier's running financial ledger across purchases, debit notes, and payments (B2.4).
 */
export async function getSupplierLedger(
  dbOrTx: DbOrTx,
  tenantId: string,
  supplierId: string,
  options?: {
    startDate?: string;
    endDate?: string;
  }
): Promise<SupplierLedgerSummary> {
  const [supplier] = await dbOrTx
    .select()
    .from(schema.suppliers)
    .where(and(eq(schema.suppliers.id, supplierId), eq(schema.suppliers.tenantId, tenantId)))
    .limit(1);

  if (!supplier) {
    throw new DomainError("SUPPLIER_NOT_FOUND", "Supplier not found");
  }

  // 1. Fetch Purchases
  const purchaseConditions = [
    eq(schema.purchases.tenantId, tenantId),
    eq(schema.purchases.supplierId, supplierId),
  ];
  if (options?.startDate) {
    purchaseConditions.push(gte(schema.purchases.invoiceDate, options.startDate));
  }
  if (options?.endDate) {
    purchaseConditions.push(lte(schema.purchases.invoiceDate, options.endDate));
  }

  const purchases = await dbOrTx
    .select({
      id: schema.purchases.id,
      purchaseNo: schema.purchases.purchaseNo,
      supplierInvoiceNo: schema.purchases.supplierInvoiceNo,
      invoiceDate: schema.purchases.invoiceDate,
      totalAmount: schema.purchases.totalAmount,
      createdAt: schema.purchases.createdAt,
    })
    .from(schema.purchases)
    .where(and(...purchaseConditions))
    .orderBy(schema.purchases.invoiceDate);

  // 2. Fetch Debit Notes / Purchase Returns
  const returnConditions = [
    eq(schema.purchaseReturns.tenantId, tenantId),
    eq(schema.purchaseReturns.supplierId, supplierId),
  ];

  const returns = await dbOrTx
    .select({
      id: schema.purchaseReturns.id,
      returnNo: schema.purchaseReturns.returnNo,
      purchaseId: schema.purchaseReturns.purchaseId,
      totalAmount: schema.purchaseReturns.totalAmount,
      reason: schema.purchaseReturns.reason,
      createdAt: schema.purchaseReturns.createdAt,
    })
    .from(schema.purchaseReturns)
    .where(and(...returnConditions))
    .orderBy(schema.purchaseReturns.createdAt);

  // 3. Fetch Payments
  const paymentConditions = [
    eq(schema.payments.tenantId, tenantId),
    eq(schema.payments.direction, "out"),
    eq(schema.payments.partyType, "supplier"),
    eq(schema.payments.partyId, supplierId),
  ];
  if (options?.startDate) {
    paymentConditions.push(gte(schema.payments.paymentDate, options.startDate));
  }
  if (options?.endDate) {
    paymentConditions.push(lte(schema.payments.paymentDate, options.endDate));
  }

  const payments = await dbOrTx
    .select({
      id: schema.payments.id,
      paymentNo: schema.payments.paymentNo,
      paymentDate: schema.payments.paymentDate,
      amount: schema.payments.amount,
      method: schema.payments.method,
      reference: schema.payments.reference,
      note: schema.payments.note,
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .where(and(...paymentConditions))
    .orderBy(schema.payments.paymentDate);

  // 4. Assemble chronological entries
  type RawLedgerItem = {
    id: string;
    timestamp: number;
    date: string;
    type: "opening" | "purchase" | "purchase_return" | "payment";
    voucherNo: string;
    referenceNo: string | null;
    description: string;
    debit: number;
    credit: number;
  };

  const rawItems: RawLedgerItem[] = [];

  // Opening balance entry (if any)
  const initialOpening = supplier.openingBalance ?? 0;
  if (initialOpening !== 0) {
    rawItems.push({
      id: `opening-${supplier.id}`,
      timestamp: new Date(supplier.createdAt).getTime() - 1000,
      date: new Date(supplier.createdAt).toISOString().split("T")[0]!,
      type: "opening",
      voucherNo: "OPENING",
      referenceNo: null,
      description: "Opening Balance",
      debit: initialOpening < 0 ? Math.abs(initialOpening) : 0,
      credit: initialOpening > 0 ? initialOpening : 0,
    });
  }

  // Purchases (Credit = increases payable)
  for (const p of purchases) {
    rawItems.push({
      id: p.id,
      timestamp: new Date(p.invoiceDate).getTime(),
      date: p.invoiceDate,
      type: "purchase",
      voucherNo: p.purchaseNo,
      referenceNo: p.supplierInvoiceNo,
      description: `Purchase GRN (Supplier Inv #${p.supplierInvoiceNo || "N/A"})`,
      debit: 0,
      credit: p.totalAmount ?? 0,
    });
  }

  // Returns / Debit notes (Debit = decreases payable)
  for (const r of returns) {
    const returnDate = r.createdAt ? new Date(r.createdAt).toISOString().split("T")[0]! : new Date().toISOString().split("T")[0]!;
    rawItems.push({
      id: r.id,
      timestamp: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
      date: returnDate,
      type: "purchase_return",
      voucherNo: r.returnNo,
      referenceNo: null,
      description: `Debit Note (${r.reason})`,
      debit: r.totalAmount ?? 0,
      credit: 0,
    });
  }

  // Payments (Debit = decreases payable)
  for (const pay of payments) {
    rawItems.push({
      id: pay.id,
      timestamp: new Date(pay.paymentDate).getTime(),
      date: pay.paymentDate,
      type: "payment",
      voucherNo: pay.paymentNo,
      referenceNo: pay.reference,
      description: `Payment (${pay.method.toUpperCase()}${pay.reference ? ` - Ref: ${pay.reference}` : ""})`,
      debit: pay.amount ?? 0,
      credit: 0,
    });
  }

  // Sort chronologically
  rawItems.sort((a, b) => a.timestamp - b.timestamp);

  // Compute running balance
  let running = 0;
  let totalPurchases = 0;
  let totalReturns = 0;
  let totalPayments = 0;

  const entries: SupplierLedgerEntry[] = rawItems.map((item) => {
    running += item.credit - item.debit;
    if (item.type === "purchase") totalPurchases += item.credit;
    if (item.type === "purchase_return") totalReturns += item.debit;
    if (item.type === "payment") totalPayments += item.debit;

    return {
      id: item.id,
      date: item.date,
      type: item.type,
      voucherNo: item.voucherNo,
      referenceNo: item.referenceNo,
      description: item.description,
      debit: item.debit,
      credit: item.credit,
      balance: running,
    };
  });

  return {
    supplier: {
      id: supplier.id,
      name: supplier.name,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      gstin: supplier.gstin,
      stateCode: supplier.stateCode,
      drugLicenseNo: supplier.drugLicenseNo,
      address: supplier.address,
      creditDays: supplier.creditDays ?? 30,
      leadTimeDays: supplier.leadTimeDays ?? 2,
      openingBalance: supplier.openingBalance ?? 0,
      isActive: supplier.isActive ?? true,
    },
    period: {
      startDate: options?.startDate,
      endDate: options?.endDate,
    },
    openingBalance: initialOpening,
    totalPurchases,
    totalReturns,
    totalPayments,
    closingBalance: running,
    entries,
  };
}

/**
 * Lists unpaid or partially paid purchase invoices for a supplier.
 */
export async function getOpenSupplierInvoices(
  dbOrTx: DbOrTx,
  tenantId: string,
  supplierId: string
) {
  const purchases = await dbOrTx
    .select({
      id: schema.purchases.id,
      purchaseNo: schema.purchases.purchaseNo,
      supplierInvoiceNo: schema.purchases.supplierInvoiceNo,
      invoiceDate: schema.purchases.invoiceDate,
      totalAmount: schema.purchases.totalAmount,
      returnedAmount: schema.purchases.returnedAmount,
    })
    .from(schema.purchases)
    .where(
      and(
        eq(schema.purchases.tenantId, tenantId),
        eq(schema.purchases.supplierId, supplierId)
      )
    )
    .orderBy(desc(schema.purchases.invoiceDate));

  return purchases.map((p) => {
    const total = p.totalAmount ?? 0;
    const returned = p.returnedAmount ?? 0;
    const netBill = Math.max(0, total - returned);
    return {
      ...p,
      netBillAmount: netBill,
    };
  });
}

/**
 * Records a payment to a supplier and posts the accounting journal entry (B2.4).
 * Debit: Supplier Creditors (decreases accounts payable)
 * Credit: Cash / Bank (asset reduction)
 */
export async function recordSupplierPayment(
  tx: Tx,
  ctx: AuthCtx,
  input: RecordSupplierPaymentInput
) {
  const [supplier] = await tx
    .select()
    .from(schema.suppliers)
    .where(and(eq(schema.suppliers.id, input.supplierId), eq(schema.suppliers.tenantId, ctx.tenantId)))
    .limit(1);

  if (!supplier) {
    throw new DomainError("SUPPLIER_NOT_FOUND", "Supplier not found");
  }

  const accounts = await getOrSeedAccounts(tx, ctx.tenantId);
  const paymentNo = await nextDocNumber(tx, ctx.tenantId, ctx.storeId, "payment", "PAY");
  const jvNo = await nextDocNumber(tx, ctx.tenantId, ctx.storeId, "journal", "JV");

  // Determine Credit Account (Cash or Bank)
  const creditAccountId = input.method === "cash" ? accounts.cash : accounts.bank;

  // 1. Create balanced double-entry journal entry
  const [entry] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      entryNo: jvNo,
      entryDate: input.paymentDate,
      narration: `Payment to ${supplier.name} via ${input.method.toUpperCase()} (${paymentNo})`,
      refType: "payment",
      createdBy: ctx.userId,
    })
    .returning({ id: schema.journalEntries.id });

  // Debit: Creditors (Supplier)
  // Credit: Cash / Bank
  const lines = [
    {
      tenantId: ctx.tenantId,
      entryId: entry.id,
      accountId: accounts.creditors,
      debit: input.amount,
      credit: 0,
      partyType: "supplier",
      partyId: supplier.id,
    },
    {
      tenantId: ctx.tenantId,
      entryId: entry.id,
      accountId: creditAccountId,
      debit: 0,
      credit: input.amount,
    },
  ];

  await tx.insert(schema.journalLines).values(lines);

  // 2. Insert into payments table
  const [payment] = await tx
    .insert(schema.payments)
    .values({
      tenantId: ctx.tenantId,
      storeId: ctx.storeId,
      paymentNo,
      direction: "out",
      partyType: "supplier",
      partyId: supplier.id,
      method: input.method,
      amount: input.amount,
      reference: input.reference ?? null,
      paymentDate: input.paymentDate,
      note: input.note ?? null,
      journalEntryId: entry.id,
      createdBy: ctx.userId,
    })
    .returning();

  // 3. Write Audit Log
  await writeAudit(tx, ctx, {
    action: "create",
    entityType: "payment",
    entityId: payment.id,
    newValue: {
      paymentNo,
      supplierId: supplier.id,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
    },
  });

  return payment;
}
