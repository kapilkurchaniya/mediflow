/**
 * Stock Conflict Cases: Exception handling for negative balances resulting from offline POS sync. (Lane A)
 * Tracks durable conflict cases, contributing offline sales, and audited resolution history.
 */
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_helpers";
import { medicines } from "./catalog";
import { devices } from "./devices";
import { batches } from "./inventory";
import { storeId, tenantId, users } from "./platform";
import { sales } from "./sales";
import { stockTransferReceiptEvents, stockTransfers } from "./transfers";

export const stockConflictCases = pgTable(
  "stock_conflict_cases",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "restrict" }),
    medicineId: uuid("medicine_id")
      .notNull()
      .references(() => medicines.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("open"), // open | investigating | partially_resolved | resolved | dismissed
    requiredReconciliationQty: integer("required_reconciliation_qty").notNull().default(0),
    reconciledQty: integer("reconciled_qty").notNull().default(0),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolutionType: text("resolution_type"), // physical_recount | shortage_reconciliation | batch_reallocation | transfer | dismissal
    resolutionNotes: text("resolution_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("stock_conflicts_tenant_store_idx").on(t.tenantId, t.storeId, t.status),
    index("stock_conflicts_batch_idx").on(t.batchId, t.status),
  ],
);

export type StockConflictCase = typeof stockConflictCases.$inferSelect;
export type NewStockConflictCase = typeof stockConflictCases.$inferInsert;

export const stockConflictContributions = pgTable(
  "stock_conflict_contributions",
  {
    id: id(),
    tenantId: tenantId(),
    conflictCaseId: uuid("conflict_case_id")
      .notNull()
      .references(() => stockConflictCases.id, { onDelete: "cascade" }),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "restrict" }),
    clientSaleId: text("client_sale_id").notNull(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "restrict" }),
    invoiceNo: text("invoice_no").notNull(),
    contributedQty: integer("contributed_qty").notNull(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conflict_contrib_case_sale_uq").on(t.conflictCaseId, t.saleId),
    index("conflict_contrib_case_idx").on(t.conflictCaseId),
  ],
);

export type StockConflictContribution = typeof stockConflictContributions.$inferSelect;
export type NewStockConflictContribution = typeof stockConflictContributions.$inferInsert;

export const stockConflictResolutions = pgTable(
  "stock_conflict_resolutions",
  {
    id: id(),
    tenantId: tenantId(),
    conflictCaseId: uuid("conflict_case_id")
      .notNull()
      .references(() => stockConflictCases.id, { onDelete: "cascade" }),
    operationKey: text("operation_key").notNull(),
    resolutionType: text("resolution_type").notNull(), // physical_recount | shortage_reconciliation | batch_reallocation | transfer | dismissal
    reconciledQty: integer("reconciled_qty").notNull().default(0),
    sourceBatchId: uuid("source_batch_id").references(() => batches.id),
    targetBatchId: uuid("target_batch_id").references(() => batches.id),
    transferId: uuid("transfer_id").references(() => stockTransfers.id),
    transferReceiptEventId: uuid("transfer_receipt_event_id").references(
      () => stockTransferReceiptEvents.id,
    ),
    stockMovementId: uuid("stock_movement_id"),
    evidenceNotes: text("evidence_notes"),
    performedBy: uuid("performed_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("conflict_res_op_key_uq").on(t.tenantId, t.operationKey),
    index("conflict_res_case_idx").on(t.conflictCaseId),
  ],
);

export type StockConflictResolution = typeof stockConflictResolutions.$inferSelect;
export type NewStockConflictResolution = typeof stockConflictResolutions.$inferInsert;
