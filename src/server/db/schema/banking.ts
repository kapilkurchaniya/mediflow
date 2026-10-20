/** Banking: bank statements and reconciliation lines. (Lane B) */
import {
  date,
  index,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, money, createdAt } from "./_helpers";
import { payments } from "./accounting";
import { stores, tenantId } from "./platform";

export const bankStatements = pgTable("bank_statements", {
  id: id(),
  tenantId: tenantId(),
  storeId: uuid("store_id").references(() => stores.id),
  bankName: text("bank_name").notNull(),
  accountNo: text("account_no").notNull(),
  statementDate: date("statement_date").notNull(),
  uploadFileName: text("upload_file_name"),
  status: text("status").notNull().default("completed"), // processing | completed
  createdAt: createdAt(),
});

export const bankStatementLines = pgTable(
  "bank_statement_lines",
  {
    id: id(),
    tenantId: tenantId(),
    statementId: uuid("statement_id").notNull().references(() => bankStatements.id, { onDelete: "cascade" }),
    transactionDate: date("transaction_date").notNull(),
    description: text("description").notNull(),
    reference: text("reference"),
    debit: money("debit"), // paise
    credit: money("credit"), // paise
    balance: money("balance"), // paise
    matchedPaymentId: uuid("matched_payment_id").references(() => payments.id),
    matchStatus: text("match_status").notNull().default("unmatched"), // unmatched | auto_matched | manual_matched | disputed
    createdAt: createdAt(),
  },
  (t) => [
    index("bank_lines_statement_idx").on(t.statementId),
    index("bank_lines_match_idx").on(t.matchStatus),
  ],
);

export type BankStatement = typeof bankStatements.$inferSelect;
export type NewBankStatement = typeof bankStatements.$inferInsert;
export type BankStatementLine = typeof bankStatementLines.$inferSelect;
export type NewBankStatementLine = typeof bankStatementLines.$inferInsert;
