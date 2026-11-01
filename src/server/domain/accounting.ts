import { schema } from "@/server/db";
import { eq, and, sql } from "drizzle-orm";
import type { DbOrTx, Tx } from "@/server/db";
import { nextDocNumber } from "./sequence";
import { format } from "date-fns";

/**
 * Standard pharmacy system accounts configuration.
 */
export const DEFAULT_ACCOUNTS = [
  { code: "1010", name: "Cash on Hand", type: "asset", systemKey: "cash" },
  { code: "1020", name: "Bank / Digital Payments", type: "asset", systemKey: "bank" },
  { code: "1050", name: "Customer Receivables", type: "asset", systemKey: "debtors" },
  { code: "1080", name: "Stock in Hand", type: "asset", systemKey: "inventory" },
  { code: "1090", name: "Input CGST", type: "asset", systemKey: "cgst_input" },
  { code: "1091", name: "Input SGST", type: "asset", systemKey: "sgst_input" },
  { code: "1092", name: "Input IGST", type: "asset", systemKey: "igst_input" },
  { code: "2010", name: "Supplier Payables", type: "liability", systemKey: "creditors" },
  { code: "2050", name: "Output CGST", type: "liability", systemKey: "cgst_output" },
  { code: "2060", name: "Output SGST", type: "liability", systemKey: "sgst_output" },
  { code: "2070", name: "Output IGST", type: "liability", systemKey: "igst_output" },
  { code: "3010", name: "Sales Account", type: "income", systemKey: "sales" },
  { code: "3020", name: "Discount Received", type: "income", systemKey: "discounts" },
  { code: "4010", name: "Purchase Account", type: "expense", systemKey: "purchases" },
  { code: "4090", name: "Round Off Account", type: "expense", systemKey: "roundoff" },
] as const;

/**
 * Ensures all default system ledger accounts exist for the given tenant.
 * Returns a map of systemKey -> accountId for quick lookups.
 */
export async function getOrSeedAccounts(tx: DbOrTx, tenantId: string): Promise<Record<string, string>> {
  const existing = await tx
    .select({ id: schema.accounts.id, systemKey: schema.accounts.systemKey })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, tenantId), sql`${schema.accounts.systemKey} IS NOT NULL`));

  const map: Record<string, string> = {};
  for (const acc of existing) {
    if (acc.systemKey) map[acc.systemKey] = acc.id;
  }

  // Insert any missing system accounts
  const missing = DEFAULT_ACCOUNTS.filter((acc) => !map[acc.systemKey]);
  if (missing.length > 0) {
    for (const acc of missing) {
      const [inserted] = await tx
        .insert(schema.accounts)
        .values({
          tenantId,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          systemKey: acc.systemKey,
          isActive: true,
        })
        .onConflictDoNothing()
        .returning({ id: schema.accounts.id });

      if (inserted?.id) {
        map[acc.systemKey] = inserted.id;
      } else {
        // In case it already existed without returning
        const [found] = await tx
          .select({ id: schema.accounts.id })
          .from(schema.accounts)
          .where(and(eq(schema.accounts.tenantId, tenantId), eq(schema.accounts.code, acc.code)))
          .limit(1);
        if (found) map[acc.systemKey] = found.id;
      }
    }
  }

  return map;
}

export interface PostSaleJournalParams {
  tx: Tx;
  tenantId: string;
  storeId: string;
  userId: string;
  saleId: string;
  invoiceNo: string;
  invoiceDate?: Date;
  customerId?: string | null;
  customerName?: string | null;
  paymentMethod?: string; // cash | upi | card | credit
  /** Split tender: what was actually received, per method. When given it replaces paymentMethod + paidAmount for the debit side. */
  payments?: { method: string; amount: number }[];
  taxableAmount: number; // in paise
  cgst: number; // in paise
  sgst: number; // in paise
  igst: number; // in paise
  roundOff: number; // in paise (+ or -)
  totalAmount: number; // in paise
  paidAmount: number; // in paise
  creditAmount: number; // in paise
}

/**
 * Creates balanced double-entry journal lines for a sales invoice.
 * Guaranteed: Total Debits == Total Credits.
 */
export async function postSaleJournalEntry(params: PostSaleJournalParams) {
  const {
    tx,
    tenantId,
    storeId,
    userId,
    saleId,
    invoiceNo,
    invoiceDate = new Date(),
    customerId,
    customerName,
    paymentMethod = "cash",
    taxableAmount,
    cgst,
    sgst,
    igst,
    roundOff,
    paidAmount,
    creditAmount,
  } = params;

  const accounts = await getOrSeedAccounts(tx, tenantId);
  const entryNo = await nextDocNumber(tx, tenantId, storeId, "journal", "JV");
  const entryDateStr = format(invoiceDate, "yyyy-MM-dd");

  const [entry] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId,
      entryNo,
      entryDate: entryDateStr,
      narration: `Sale invoice ${invoiceNo}${customerName ? ` to ${customerName}` : ""}`,
      refType: "sale",
      refId: saleId,
      createdBy: userId,
    })
    .returning({ id: schema.journalEntries.id });

  const lines: {
    tenantId: string;
    entryId: string;
    accountId: string;
    debit: number;
    credit: number;
    partyType?: string;
    partyId?: string;
  }[] = [];

  // --- 1. DEBITS (Cash / Bank / Debtors) ---
  // One line per account: cash goes to Cash on Hand, UPI / card / bank to Bank / Digital Payments.
  const received = params.payments?.length
    ? params.payments
    : paidAmount > 0
      ? [{ method: paymentMethod, amount: paidAmount }]
      : [];
  const byAccount = new Map<string, number>();
  for (const p of received) {
    if (p.amount <= 0) continue;
    const isBank = p.method === "upi" || p.method === "card" || p.method === "bank";
    const accId = accounts[isBank ? "bank" : "cash"] || accounts.cash;
    byAccount.set(accId, (byAccount.get(accId) ?? 0) + p.amount);
  }
  for (const [accountId, amount] of byAccount) {
    lines.push({ tenantId, entryId: entry.id, accountId, debit: amount, credit: 0 });
  }

  if (creditAmount > 0 && accounts.debtors) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.debtors,
      debit: creditAmount,
      credit: 0,
      partyType: "customer",
      partyId: customerId || undefined,
    });
  }

  // --- 2. CREDITS (Revenue & Output Taxes) ---
  if (taxableAmount > 0 && accounts.sales) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.sales,
      debit: 0,
      credit: taxableAmount,
    });
  }

  if (cgst > 0 && accounts.cgst_output) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.cgst_output,
      debit: 0,
      credit: cgst,
    });
  }

  if (sgst > 0 && accounts.sgst_output) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.sgst_output,
      debit: 0,
      credit: sgst,
    });
  }

  if (igst > 0 && accounts.igst_output) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.igst_output,
      debit: 0,
      credit: igst,
    });
  }

  // --- 3. ROUND OFF ---
  if (roundOff !== 0 && accounts.roundoff) {
    if (roundOff < 0) {
      // Roundoff discount (expense / debit)
      lines.push({
        tenantId,
        entryId: entry.id,
        accountId: accounts.roundoff,
        debit: Math.abs(roundOff),
        credit: 0,
      });
    } else {
      // Roundoff gain (income / credit)
      lines.push({
        tenantId,
        entryId: entry.id,
        accountId: accounts.roundoff,
        debit: 0,
        credit: roundOff,
      });
    }
  }

  // Enforce double-entry balance: sum(debit) == sum(credit)
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  if (totalDebit !== totalCredit) {
    // If minor 1-paise variance, absorb into roundoff
    const diff = totalDebit - totalCredit;
    if (Math.abs(diff) <= 2 && accounts.roundoff) {
      if (diff > 0) {
        lines.push({ tenantId, entryId: entry.id, accountId: accounts.roundoff, debit: 0, credit: diff });
      } else {
        lines.push({ tenantId, entryId: entry.id, accountId: accounts.roundoff, debit: Math.abs(diff), credit: 0 });
      }
    }
  }

  if (lines.length > 0) {
    await tx.insert(schema.journalLines).values(lines);
  }

  return entry.id;
}

export interface PostPurchaseJournalParams {
  tx: Tx;
  tenantId: string;
  storeId: string;
  userId: string;
  purchaseId: string;
  purchaseNo: string;
  supplierId: string;
  supplierInvoiceNo: string;
  invoiceDate: string;
  taxableAmount: number; // in paise
  cgst: number; // in paise
  sgst: number; // in paise
  igst: number; // in paise
  roundOff?: number; // in paise
  cashDiscountAmount?: number; // in paise
  totalAmount: number; // in paise
}

/**
 * Creates balanced double-entry journal lines for a purchase invoice (GRN).
 * Debit: Purchases + Input GST
 * Credit: Supplier Payable (Creditors)
 */
export async function postPurchaseJournalEntry(params: PostPurchaseJournalParams) {
  const {
    tx,
    tenantId,
    storeId,
    userId,
    purchaseId,
    purchaseNo,
    supplierId,
    supplierInvoiceNo,
    invoiceDate,
    taxableAmount,
    cgst,
    sgst,
    igst,
    roundOff,
    cashDiscountAmount,
    totalAmount,
  } = params;

  const accounts = await getOrSeedAccounts(tx, tenantId);
  const entryNo = await nextDocNumber(tx, tenantId, storeId, "journal", "JV");

  const [entry] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId,
      entryNo,
      entryDate: invoiceDate,
      narration: `Purchase GRN ${purchaseNo} (Supplier Inv #${supplierInvoiceNo})`,
      refType: "purchase",
      refId: purchaseId,
      createdBy: userId,
    })
    .returning({ id: schema.journalEntries.id });

  const lines: {
    tenantId: string;
    entryId: string;
    accountId: string;
    debit: number;
    credit: number;
    partyType?: string;
    partyId?: string;
  }[] = [];

  // --- 1. DEBITS (Purchase expense & Input GST assets) ---
  if (taxableAmount > 0 && accounts.purchases) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.purchases,
      debit: taxableAmount,
      credit: 0,
    });
  }

  if (cgst > 0 && accounts.cgst_input) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.cgst_input,
      debit: cgst,
      credit: 0,
    });
  }

  if (sgst > 0 && accounts.sgst_input) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.sgst_input,
      debit: sgst,
      credit: 0,
    });
  }

  if (igst > 0 && accounts.igst_input) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.igst_input,
      debit: igst,
      credit: 0,
    });
  }

  // --- 2. ROUND OFF ---
  if (roundOff !== undefined && roundOff !== 0 && accounts.roundoff) {
    if (roundOff < 0) {
      // Total rounded down -> supplier gave roundoff discount (credit)
      lines.push({
        tenantId,
        entryId: entry.id,
        accountId: accounts.roundoff,
        debit: 0,
        credit: Math.abs(roundOff),
      });
    } else {
      // Total rounded up -> expense (debit)
      lines.push({
        tenantId,
        entryId: entry.id,
        accountId: accounts.roundoff,
        debit: roundOff,
        credit: 0,
      });
    }
  }

  // --- 2b. CASH DISCOUNT / DISCOUNT RECEIVED ---
  if (cashDiscountAmount !== undefined && cashDiscountAmount > 0 && accounts.discounts) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.discounts,
      debit: 0,
      credit: cashDiscountAmount,
    });
  }

  // --- 3. CREDIT (Supplier Creditors) ---
  if (totalAmount > 0 && accounts.creditors) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.creditors,
      debit: 0,
      credit: totalAmount,
      partyType: "supplier",
      partyId: supplierId,
    });
  }

  // Check balance and adjust 1-paise variance if any
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  if (totalDebit !== totalCredit && accounts.roundoff) {
    const diff = totalDebit - totalCredit;
    if (Math.abs(diff) <= 2) {
      if (diff > 0) {
        lines.push({ tenantId, entryId: entry.id, accountId: accounts.roundoff, debit: 0, credit: diff });
      } else {
        lines.push({ tenantId, entryId: entry.id, accountId: accounts.roundoff, debit: Math.abs(diff), credit: 0 });
      }
    }
  }

  if (lines.length > 0) {
    await tx.insert(schema.journalLines).values(lines);
  }

  return entry.id;
}


export interface PostPurchaseReturnJournalParams {
  tx: Tx;
  tenantId: string;
  storeId: string;
  userId: string;
  returnId: string;
  returnNo: string;
  supplierId: string;
  returnDate: string;
  taxableAmount: number; // in paise
  cgst: number; // in paise
  sgst: number; // in paise
  igst: number; // in paise
  roundOff?: number; // in paise
  totalAmount: number; // in paise
}

/**
 * Creates balanced double-entry journal lines for a purchase return / debit note (B2.3).
 * Debit: Supplier Payable (Creditors)
 * Credit: Purchases (reversal) + Input GST (reversal)
 */
export async function postPurchaseReturnJournalEntry(params: PostPurchaseReturnJournalParams) {
  const {
    tx,
    tenantId,
    storeId,
    userId,
    returnId,
    returnNo,
    supplierId,
    returnDate,
    taxableAmount,
    cgst,
    sgst,
    igst,
    roundOff,
    totalAmount,
  } = params;

  const accounts = await getOrSeedAccounts(tx, tenantId);
  const entryNo = await nextDocNumber(tx, tenantId, storeId, "journal", "JV");

  const [entry] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId,
      entryNo,
      entryDate: returnDate,
      narration: `Purchase Return Debit Note ${returnNo}`,
      refType: "purchase_return",
      refId: returnId,
      createdBy: userId,
    })
    .returning({ id: schema.journalEntries.id });

  const lines: {
    tenantId: string;
    entryId: string;
    accountId: string;
    debit: number;
    credit: number;
    partyType?: string;
    partyId?: string;
  }[] = [];

  // --- 1. DEBIT (Supplier Creditors) ---
  if (totalAmount > 0 && accounts.creditors) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.creditors,
      debit: totalAmount,
      credit: 0,
      partyType: "supplier",
      partyId: supplierId,
    });
  }

  // --- 2. CREDITS (Purchases & Input GST reversals) ---
  if (taxableAmount > 0 && accounts.purchases) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.purchases,
      debit: 0,
      credit: taxableAmount,
    });
  }

  if (cgst > 0 && accounts.cgst_input) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.cgst_input,
      debit: 0,
      credit: cgst,
    });
  }

  if (sgst > 0 && accounts.sgst_input) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.sgst_input,
      debit: 0,
      credit: sgst,
    });
  }

  if (igst > 0 && accounts.igst_input) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.igst_input,
      debit: 0,
      credit: igst,
    });
  }

  // --- 3. ROUND OFF ---
  if (roundOff !== undefined && roundOff !== 0 && accounts.roundoff) {
    if (roundOff < 0) {
      lines.push({
        tenantId,
        entryId: entry.id,
        accountId: accounts.roundoff,
        debit: Math.abs(roundOff),
        credit: 0,
      });
    } else {
      lines.push({
        tenantId,
        entryId: entry.id,
        accountId: accounts.roundoff,
        debit: 0,
        credit: roundOff,
      });
    }
  }

  // Check balance and adjust 1-paise variance if any
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  if (totalDebit !== totalCredit && accounts.roundoff) {
    const diff = totalDebit - totalCredit;
    if (Math.abs(diff) <= 2) {
      if (diff > 0) {
        lines.push({ tenantId, entryId: entry.id, accountId: accounts.roundoff, debit: 0, credit: diff });
      } else {
        lines.push({ tenantId, entryId: entry.id, accountId: accounts.roundoff, debit: Math.abs(diff), credit: 0 });
      }
    }
  }

  if (lines.length > 0) {
    await tx.insert(schema.journalLines).values(lines);
  }

  return entry.id;
}

export interface PostSaleReturnJournalParams {
  tx: Tx;
  tenantId: string;
  storeId: string;
  userId: string;
  returnId: string;
  returnNo: string;
  returnDate?: Date;
  saleId: string;
  invoiceNo: string;
  customerId?: string | null;
  customerName?: string | null;
  refundMethod: string; // cash | upi | card | credit_note | bank
  taxableAmount: number; // in paise
  cgst: number; // in paise
  sgst: number; // in paise
  igst: number; // in paise
  roundOff?: number; // in paise
  totalAmount: number; // in paise
}

/**
 * Creates balanced double-entry journal lines for a customer sale return (Credit Note).
 *
 * Debits:
 * - Sales Account (reversal of revenue)
 * - Output CGST / SGST / IGST (reversal of output tax)
 * - Roundoff (if any)
 *
 * Credits:
 * - Cash on Hand (cash refund)
 * - Bank / Digital Payments (upi / card / bank refund)
 * - Customer Receivables (debtors credit note)
 */
export async function postSaleReturnJournalEntry(params: PostSaleReturnJournalParams): Promise<string> {
  const {
    tx,
    tenantId,
    storeId,
    userId,
    returnId,
    returnNo,
    returnDate = new Date(),
    saleId: _saleId,
    invoiceNo,
    customerId,
    customerName,
    refundMethod,
    taxableAmount,
    cgst,
    sgst,
    igst,
    roundOff = 0,
    totalAmount,
  } = params;

  const accounts = await getOrSeedAccounts(tx, tenantId);
  const entryNo = await nextDocNumber(tx, tenantId, storeId, "journal", "JV");
  const entryDateStr = format(returnDate, "yyyy-MM-dd");

  const [entry] = await tx
    .insert(schema.journalEntries)
    .values({
      tenantId,
      storeId,
      entryNo,
      entryDate: entryDateStr,
      narration: `Sale Return Credit Note ${returnNo} against Invoice ${invoiceNo}${customerName ? ` (${customerName})` : ""}`,
      refType: "sale_return",
      refId: returnId,
      createdBy: userId,
    })
    .returning({ id: schema.journalEntries.id });

  const lines: {
    tenantId: string;
    entryId: string;
    accountId: string;
    debit: number;
    credit: number;
    partyType?: string;
    partyId?: string;
  }[] = [];

  // --- 1. DEBITS (Revenue & Output GST Reversals) ---
  if (taxableAmount > 0 && accounts.sales) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.sales,
      debit: taxableAmount,
      credit: 0,
    });
  }

  if (cgst > 0 && accounts.cgst_output) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.cgst_output,
      debit: cgst,
      credit: 0,
    });
  }

  if (sgst > 0 && accounts.sgst_output) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.sgst_output,
      debit: sgst,
      credit: 0,
    });
  }

  if (igst > 0 && accounts.igst_output) {
    lines.push({
      tenantId,
      entryId: entry.id,
      accountId: accounts.igst_output,
      debit: igst,
      credit: 0,
    });
  }

  // --- 2. CREDITS (Refund / Settlement Method) ---
  if (totalAmount > 0) {
    if (refundMethod === "cash" && accounts.cash) {
      lines.push({
        tenantId,
        entryId: entry.id,
        accountId: accounts.cash,
        debit: 0,
        credit: totalAmount,
      });
    } else if ((refundMethod === "upi" || refundMethod === "card" || refundMethod === "bank") && accounts.bank) {
      lines.push({
        tenantId,
        entryId: entry.id,
        accountId: accounts.bank,
        debit: 0,
        credit: totalAmount,
      });
    } else if (refundMethod === "credit_note" && accounts.debtors) {
      lines.push({
        tenantId,
        entryId: entry.id,
        accountId: accounts.debtors,
        debit: 0,
        credit: totalAmount,
        partyType: "customer",
        partyId: customerId || undefined,
      });
    } else {
      // Fallback to cash or bank if specific account not matched
      const fallbackAcc = accounts.cash || accounts.bank;
      if (fallbackAcc) {
        lines.push({
          tenantId,
          entryId: entry.id,
          accountId: fallbackAcc,
          debit: 0,
          credit: totalAmount,
        });
      }
    }
  }

  // --- 3. ROUND OFF ---
  if (roundOff !== 0 && accounts.roundoff) {
    if (roundOff < 0) {
      lines.push({
        tenantId,
        entryId: entry.id,
        accountId: accounts.roundoff,
        debit: Math.abs(roundOff),
        credit: 0,
      });
    } else {
      lines.push({
        tenantId,
        entryId: entry.id,
        accountId: accounts.roundoff,
        debit: 0,
        credit: roundOff,
      });
    }
  }

  // Check balance and adjust 1-paise variance if any
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  if (totalDebit !== totalCredit && accounts.roundoff) {
    const diff = totalDebit - totalCredit;
    if (Math.abs(diff) <= 2) {
      if (diff > 0) {
        lines.push({ tenantId, entryId: entry.id, accountId: accounts.roundoff, debit: 0, credit: diff });
      } else {
        lines.push({ tenantId, entryId: entry.id, accountId: accounts.roundoff, debit: Math.abs(diff), credit: 0 });
      }
    }
  }

  if (lines.length > 0) {
    await tx.insert(schema.journalLines).values(lines);
  }

  return entry.id;
}
