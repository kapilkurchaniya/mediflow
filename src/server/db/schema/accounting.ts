/** Accounting: chart of accounts, double-entry journal, receipts/payments. (Lane A) */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, money, createdAt, updatedAt } from "./_helpers";
import { storeId, tenantId, stores } from "./platform";
import { batches, stockMovements } from "./inventory";

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    tenantId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(), // asset | liability | equity | income | expense
    systemKey: text("system_key"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("accounts_tenant_code_uq").on(t.tenantId, t.code),
    uniqueIndex("accounts_tenant_syskey_uq").on(t.tenantId, t.systemKey).where(sql`${t.systemKey} is not null`),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id"),
    entryNo: text("entry_no").notNull(),
    entryDate: date("entry_date").notNull(),
    narration: text("narration").notNull(),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("journal_entries_tenant_id_uq").on(t.tenantId, t.id),
    index("journal_tenant_date_idx").on(t.tenantId, t.entryDate),
    index("journal_ref_idx").on(t.refType, t.refId),
    index("journal_tenant_store_date_idx").on(t.tenantId, t.storeId, t.entryDate),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantId(),
    entryId: uuid("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    debit: money("debit"),
    credit: money("credit"),
    partyType: text("party_type"), // customer | supplier
    partyId: uuid("party_id"),
  },
  (t) => [
    index("journal_lines_account_idx").on(t.tenantId, t.accountId),
    index("journal_lines_party_idx").on(t.partyType, t.partyId),
    index("journal_lines_tenant_party_idx").on(t.tenantId, t.partyType, t.partyId),
    index("journal_lines_entry_idx").on(t.entryId),
    foreignKey({
      columns: [t.tenantId, t.entryId],
      foreignColumns: [journalEntries.tenantId, journalEntries.id],
      name: "journal_lines_tenant_entry_fk",
    }).onDelete("cascade"),
  ],
);

/** Receipts from customers (direction=in) and payments to suppliers / expenses (direction=out). */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    paymentNo: text("payment_no").notNull(),
    direction: text("direction").notNull(), // in | out
    partyType: text("party_type"), // customer | supplier | expense
    partyId: uuid("party_id"),
    expenseAccountId: uuid("expense_account_id").references(() => accounts.id),
    method: text("method").notNull(), // cash | upi | card | bank
    amount: money("amount"),
    reference: text("reference"),
    paymentDate: date("payment_date").notNull(),
    note: text("note"),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
    clientOperationId: uuid("client_operation_id"),
    cashSessionId: uuid("cash_session_id"),
    paidFromTill: boolean("paid_from_till").notNull().default(false),
    payeeName: text("payee_name"),
    vendorInvoiceNo: text("vendor_invoice_no"),
    vendorInvoiceDate: date("vendor_invoice_date"),
    vendorGstin: text("vendor_gstin"),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_party_idx").on(t.partyType, t.partyId),
    index("payments_cash_session_idx").on(t.tenantId, t.cashSessionId),
    uniqueIndex("payments_tenant_client_op_uq")
      .on(t.tenantId, t.clientOperationId)
      .where(sql`${t.clientOperationId} is not null`),
  ],
);

/** Bill-wise allocations linking receipts and payments to specific sales or purchases. */
export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: id(),
    tenantId: tenantId(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    refType: text("ref_type").notNull(), // 'sale' | 'purchase'
    refId: uuid("ref_id").notNull(),
    amount: money("amount").notNull(), // positive integer paise
    createdAt: createdAt(),
  },
  (t) => [
    index("payment_alloc_tenant_payment_idx").on(t.tenantId, t.paymentId),
    index("payment_alloc_tenant_ref_idx").on(t.tenantId, t.refType, t.refId),
  ],
);

/** Monthly accounting periods with hierarchical scope (tenant-wide master lock, optional GSTIN secondary lock). */
export const accountingPeriods = pgTable(
  "accounting_periods",
  {
    id: id(),
    tenantId: tenantId(),
    gstin: text("gstin"),
    periodKey: text("period_key").notNull(), // 'YYYY-MM'
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    financialYear: text("financial_year").notNull(), // e.g. '2026-2027'
    status: text("status").notNull().default("open"), // 'open' | 'locked'
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: uuid("locked_by"),
    lockNote: text("lock_note"),
    closingSnapshot: jsonb("closing_snapshot"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("acct_periods_tenant_global_uq")
      .on(t.tenantId, t.periodKey)
      .where(sql`${t.gstin} is null`),
    uniqueIndex("acct_periods_tenant_gstin_uq")
      .on(t.tenantId, t.gstin, t.periodKey)
      .where(sql`${t.gstin} is not null`),
    index("acct_periods_tenant_fy_idx").on(t.tenantId, t.financialYear),
    index("acct_periods_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

/** Immutable audit event log for period lock & reopen transitions. */
export const accountingPeriodEvents = pgTable(
  "accounting_period_events",
  {
    id: id(),
    tenantId: tenantId(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => accountingPeriods.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(), // 'lock' | 'reopen'
    eventSequence: integer("event_sequence").notNull(),
    reason: text("reason").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    performedBy: uuid("performed_by").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("acct_period_events_period_seq_idx").on(t.periodId, t.eventSequence),
    index("acct_period_events_tenant_idx").on(t.tenantId, t.performedAt),
  ],
);

export * from "./opening-balances";
