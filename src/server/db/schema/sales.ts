/** Sales: bills, lines, payments, returns, cash register shifts. (Lane A) */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, money, createdAt } from "./_helpers";
import { medicines } from "./catalog";
import { prescriptions } from "./compliance";
import { customers, medicalReps } from "./crm";
import { batches } from "./inventory";
import { storeId, tenantId, users } from "./platform";

export const sales = pgTable(
  "sales",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    invoiceNo: text("invoice_no"),
    status: text("status").notNull().default("draft"), // draft | held | completed | cancelled
    customerId: uuid("customer_id").references(() => customers.id),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    medicalRepId: uuid("medical_rep_id").references(() => medicalReps.id),
    doctorName: text("doctor_name"),
    doctorRegNo: text("doctor_reg_no"),
    doctorAddress: text("doctor_address"),
    patientAge: integer("patient_age"),
    patientGender: text("patient_gender"),
    patientAddress: text("patient_address"),
    prescriptionId: uuid("prescription_id").references(() => prescriptions.id),
    prescriptionRef: text("prescription_ref"),
    pharmacistId: uuid("pharmacist_id").references(() => users.id),
    isInterState: boolean("is_inter_state").notNull().default(false),
    grossAmount: money("gross_amount"),
    discountAmount: money("discount_amount"),
    taxableAmount: money("taxable_amount"),
    cgst: money("cgst"),
    sgst: money("sgst"),
    igst: money("igst"),
    roundOff: money("round_off"),
    totalAmount: money("total_amount"),
    paidAmount: money("paid_amount"),
    creditAmount: money("credit_amount"),
    costAmount: money("cost_amount"),
    returnedAmount: money("returned_amount"),
    heldPayload: jsonb("held_payload"),
    notes: text("notes"),
    createdBy: uuid("created_by").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sales_store_invoice_uq").on(t.storeId, t.invoiceNo).where(sql`${t.invoiceNo} is not null`),
    index("sales_store_completed_idx").on(t.storeId, t.completedAt),
    index("sales_customer_idx").on(t.customerId),
  ],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: id(),
    tenantId: tenantId(),
    saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    medicineName: text("medicine_name").notNull(),
    batchNo: text("batch_no").notNull(),
    expiryDate: date("expiry_date").notNull(),
    hsn: text("hsn"),
    qty: integer("qty").notNull(),
    returnedQty: integer("returned_qty").notNull().default(0),
    mrp: money("mrp"),
    rate: money("rate"),
    discountBp: integer("discount_bp").notNull().default(0),
    discountAmount: money("discount_amount"),
    taxableAmount: money("taxable_amount"),
    gstRateBp: integer("gst_rate_bp").notNull(),
    cgst: money("cgst"),
    sgst: money("sgst"),
    igst: money("igst"),
    totalAmount: money("total_amount"),
    unitCost: money("unit_cost"),
  },
  (t) => [index("sale_items_sale_idx").on(t.saleId), index("sale_items_med_idx").on(t.medicineId)],
);

export const salePayments = pgTable(
  "sale_payments",
  {
    id: id(),
    tenantId: tenantId(),
    saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    method: text("method").notNull(), // cash | upi | card | credit | bank
    amount: money("amount"),
    reference: text("reference"),
    status: text("status").notNull().default("success"),
    createdAt: createdAt(),
  },
  (t) => [index("sale_payments_sale_idx").on(t.saleId)],
);

export const saleReturns = pgTable("sale_returns", {
  id: id(),
  tenantId: tenantId(),
  storeId: storeId(),
  saleId: uuid("sale_id").notNull().references(() => sales.id),
  returnNo: text("return_no").notNull(),
  taxableAmount: money("taxable_amount"),
  taxAmount: money("tax_amount"),
  totalAmount: money("total_amount"),
  refundMethod: text("refund_method").notNull(), // cash | upi | card | credit_note
  reason: text("reason").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: createdAt(),
});

export const saleReturnItems = pgTable("sale_return_items", {
  id: id(),
  tenantId: tenantId(),
  returnId: uuid("return_id").notNull().references(() => saleReturns.id, { onDelete: "cascade" }),
  saleItemId: uuid("sale_item_id").notNull().references(() => saleItems.id),
  qty: integer("qty").notNull(),
  taxableAmount: money("taxable_amount"),
  taxAmount: money("tax_amount"),
  totalAmount: money("total_amount"),
});

export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    status: text("status").notNull().default("open"), // open | closed
    openingCash: money("opening_cash"),
    expectedCash: money("expected_cash"),
    actualCash: money("actual_cash"),
    difference: money("difference"),
    openedBy: uuid("opened_by").notNull(),
    closedBy: uuid("closed_by"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("cash_sessions_one_open_uq").on(t.storeId).where(sql`${t.status} = 'open'`)],
);
