/** Inventory: batches and the immutable stock ledger. (Lane A) */
import {
  bigserial,
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
import { id, money, createdAt, updatedAt } from "./_helpers";
import { medicines } from "./catalog";
import { storeId, tenantId } from "./platform";
import { suppliers } from "./purchasing";

export const batches = pgTable(
  "batches",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
    batchNo: text("batch_no").notNull(),
    expiryDate: date("expiry_date").notNull(),
    mfgDate: date("mfg_date"),
    /** Landed cost per unit (after scheme/free qty), excluding GST. */
    purchaseRate: money("purchase_rate"),
    mrp: money("mrp"),
    /** GST-inclusive selling price per unit. */
    saleRate: money("sale_rate"),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    qtyOnHand: integer("qty_on_hand").notNull().default(0),
    status: text("status").notNull().default("active"), // active | hold
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("batches_store_med_batch_uq").on(t.storeId, t.medicineId, t.batchNo),
    uniqueIndex("batches_tenant_store_id_uq").on(t.tenantId, t.storeId, t.id),
    index("batches_store_med_idx").on(t.storeId, t.medicineId),
    index("batches_expiry_idx").on(t.tenantId, t.expiryDate),
    index("batches_store_updated_idx").on(t.storeId, t.updatedAt, t.id),
  ],
);

/** Immutable stock ledger. Never updated or deleted. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantId(),
    storeId: storeId(),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
    // opening | purchase | sale | sale_return | purchase_return | adjustment | damage | expired | transfer_in | transfer_out
    type: text("type").notNull(),
    qtyChange: integer("qty_change").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    unitCost: money("unit_cost"),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    note: text("note"),
    userId: uuid("user_id"),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("stock_movements_tenant_store_id_uq").on(t.tenantId, t.storeId, t.id),
    index("stock_mov_tenant_store_effective_idx").on(t.tenantId, t.storeId, t.effectiveAt),
    index("stock_mov_batch_idx").on(t.batchId, t.id),
    index("stock_mov_store_created_idx").on(t.storeId, t.createdAt),
    index("stock_mov_med_idx").on(t.medicineId, t.createdAt),
  ],
);

export const stockAdjustments = pgTable("stock_adjustments", {
  id: id(),
  tenantId: tenantId(),
  storeId: storeId(),
  batchId: uuid("batch_id").notNull().references(() => batches.id),
  qtyChange: integer("qty_change").notNull(),
  kind: text("kind").notNull(), // adjustment | damage | expired
  reason: text("reason").notNull(),
  userId: uuid("user_id").notNull(),
  createdAt: createdAt(),
});

/** Re-export stock transfers from transfers.ts (Task A3.4) */
export {
  stockTransfers,
  stockTransferItems,
  stockTransferReceiptEvents,
} from "./transfers";

/** Expired/damaged stock quarantined away from POS. (Task B3.6) */
export const quarantineBatches = pgTable(
  "quarantine_batches",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    qty: integer("qty").notNull(),
    reason: text("reason").notNull().default("expired"), // expired | damaged | recalled
    status: text("status").notNull().default("quarantined"), // quarantined | claimed | written_off
    claimId: uuid("claim_id"),
    notes: text("notes"),
    quarantinedBy: uuid("quarantined_by").notNull(),
    quarantinedAt: timestamp("quarantined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("quarantine_batches_store_status_idx").on(t.storeId, t.status),
    index("quarantine_batches_supplier_idx").on(t.supplierId, t.status),
  ]
);

/** Formal expiry / damage debit claims against distributors. (Task B3.6) */
export const expiryClaims = pgTable(
  "expiry_claims",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    claimNo: text("claim_no").notNull(), // DN/EXP/2026/0001
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    status: text("status").notNull().default("draft"), // draft | submitted | settled | rejected
    totalPaise: money("total_paise").notNull().default(0),
    supplierCreditNoteNo: text("supplier_credit_note_no"),
    settlementType: text("settlement_type"), // credit_note | replacement_stock | written_off
    notes: text("notes"),
    createdBy: uuid("created_by").notNull(),
    settledBy: uuid("settled_by"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("expiry_claims_no_uq").on(t.tenantId, t.claimNo),
    index("expiry_claims_supplier_idx").on(t.supplierId, t.status),
    index("expiry_claims_store_idx").on(t.storeId, t.status),
  ]
);

export const expiryClaimItems = pgTable(
  "expiry_claim_items",
  {
    id: id(),
    tenantId: tenantId(),
    claimId: uuid("claim_id").notNull().references(() => expiryClaims.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
    qty: integer("qty").notNull(),
    ratePaise: money("rate_paise").notNull().default(0),
    totalPaise: money("total_paise").notNull().default(0),
  },
  (t) => [index("expiry_claim_items_claim_idx").on(t.claimId)]
);

/** Physical stocktake and rack audit sessions. (Task B3.7) */
export const stockAuditSessions = pgTable(
  "stock_audit_sessions",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    sessionNo: text("session_no").notNull(), // AUD/2026/001
    scope: text("scope").notNull().default("racks"), // full_store | racks
    rackIds: jsonb("rack_ids").$type<string[]>().default([]),
    blindCount: boolean("blind_count").notNull().default(true),
    status: text("status").notNull().default("in_progress"), // in_progress | under_review | approved | cancelled
    notes: text("notes"),
    startedBy: uuid("started_by").notNull(),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("stock_audit_sessions_no_uq").on(t.tenantId, t.sessionNo),
    index("stock_audit_sessions_store_idx").on(t.storeId, t.status),
  ]
);

export const stockAuditItems = pgTable(
  "stock_audit_items",
  {
    id: id(),
    tenantId: tenantId(),
    sessionId: uuid("session_id").notNull().references(() => stockAuditSessions.id, { onDelete: "cascade" }),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
    rackId: uuid("rack_id"),
    systemQty: integer("system_qty").notNull().default(0),
    countedQty: integer("counted_qty"),
    varianceQty: integer("variance_qty"), // countedQty - systemQty
    unitCostPaise: money("unit_cost_paise").notNull().default(0),
    varianceCostPaise: money("variance_cost_paise").notNull().default(0),
    status: text("status").notNull().default("pending"), // pending | counted | reconciled
    countedBy: uuid("counted_by"),
    countedAt: timestamp("counted_at", { withTimezone: true }),
  },
  (t) => [index("stock_audit_items_session_idx").on(t.sessionId)]
);

export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
export type {
  StockTransfer,
  NewStockTransfer,
  StockTransferItem,
  NewStockTransferItem,
  StockTransferReceiptEvent,
  NewStockTransferReceiptEvent,
} from "./transfers";
export type QuarantineBatch = typeof quarantineBatches.$inferSelect;
export type ExpiryClaim = typeof expiryClaims.$inferSelect;
export type ExpiryClaimItem = typeof expiryClaimItems.$inferSelect;
export type StockAuditSession = typeof stockAuditSessions.$inferSelect;
export type StockAuditItem = typeof stockAuditItems.$inferSelect;
