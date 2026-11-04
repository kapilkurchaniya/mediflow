/**
 * Stock Transfers: Inter-branch and warehouse transfer movements. (Lane A)
 * Supports Rule 55 Delivery Challan vs Rule 46 Tax Invoice, multi-lot partial receipts,
 * batch identity preservation, and idempotency tracking.
 */
import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, money, createdAt, updatedAt } from "./_helpers";
import { medicines } from "./catalog";
import { batches } from "./inventory";
import { stores, tenantId } from "./platform";

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: id(),
    tenantId: tenantId(),
    transferNo: text("transfer_no").notNull(), // sequential: "TR/26-27/000001"
    fromStoreId: uuid("from_store_id")
      .notNull()
      .references(() => stores.id),
    toStoreId: uuid("to_store_id")
      .notNull()
      .references(() => stores.id),
    status: text("status").notNull().default("draft"), // 'draft' | 'dispatched' | 'partially_received' | 'received' | 'cancelled'
    docKind: text("doc_kind").notNull().default("delivery_challan"), // 'delivery_challan' | 'tax_invoice'
    gstDocumentId: uuid("gst_document_id"),
    notes: text("notes"),

    // Statutory Document Details (GST Rule 55 vs Rule 46)
    documentNo: text("document_no"), // sequential e.g. "DC/26-27/000001" or "TI/26-27/000001"
    documentDate: timestamp("document_date", { withTimezone: true }),

    // Immutable GST Snapshots at Issuance
    gstinSourceSnapshot: text("gstin_source_snapshot"),
    gstinDestSnapshot: text("gstin_dest_snapshot"),
    sourceAddressSnapshot: text("source_address_snapshot"),
    destAddressSnapshot: text("dest_address_snapshot"),
    placeOfSupply: text("place_of_supply"),

    // Transportation & E-way Bill
    transportMode: text("transport_mode").default("road"), // road | rail | air
    vehicleNo: text("vehicle_no"),
    transporterName: text("transporter_name"),
    transporterId: text("transporter_id"),
    eWayBillNo: text("e_way_bill_no"),
    eWayBillDate: timestamp("e_way_bill_date", { withTimezone: true }),

    // Financial / Valuation Snapshot (Paise)
    taxableValuePaise: money("taxable_value_paise").default(0),
    cgstPaise: money("cgst_paise").default(0),
    sgstPaise: money("sgst_paise").default(0),
    igstPaise: money("igst_paise").default(0),
    totalValuePaise: money("total_value_paise").default(0),

    // Audit & Timestamps
    createdBy: uuid("created_by").notNull(),
    dispatchedBy: uuid("dispatched_by"),
    receivedBy: uuid("received_by"),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: text("cancel_reason"),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("stock_transfers_no_uq").on(t.tenantId, sql`lower(${t.transferNo})`),
    index("stock_transfers_from_idx").on(t.fromStoreId, t.status),
    index("stock_transfers_to_idx").on(t.toStoreId, t.status),
    index("stock_transfers_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    id: id(),
    tenantId: tenantId(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => stockTransfers.id, { onDelete: "cascade" }),
    medicineId: uuid("medicine_id")
      .notNull()
      .references(() => medicines.id),
    fromBatchId: uuid("from_batch_id")
      .notNull()
      .references(() => batches.id),
    toBatchId: uuid("to_batch_id").references(() => batches.id),

    // Batch snapshots for absolute audit and statutory invoice lines
    batchNo: text("batch_no").notNull(),
    expiryDate: date("expiry_date").notNull(),
    mfgDate: date("mfg_date"),
    hsn: text("hsn"),
    unitCost: money("unit_cost"),
    mrp: money("mrp"),
    saleRate: money("sale_rate"),
    gstRateBp: integer("gst_rate_bp").notNull().default(0),

    // Quantities in canonical base units
    qty: integer("qty").notNull(), // requested qty
    qtyDispatched: integer("qty_dispatched").notNull().default(0),
    receivedQty: integer("received_qty").notNull().default(0), // cumulative accepted
    qtyDamaged: integer("qty_damaged").notNull().default(0), // cumulative damaged
    qtyShortage: integer("qty_shortage").notNull().default(0), // cumulative shortage

    discrepancyReason: text("discrepancy_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("stock_transfer_items_trf_idx").on(t.transferId),
    index("stock_transfer_items_med_batch_idx").on(t.medicineId, t.batchNo),
  ],
);

export const stockTransferReceiptEvents = pgTable(
  "stock_transfer_receipt_events",
  {
    id: id(),
    tenantId: tenantId(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => stockTransfers.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    receivedBy: uuid("received_by").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    notes: text("notes"),
  },
  (t) => [
    uniqueIndex("uq_transfer_receipt_idempotency").on(t.tenantId, t.transferId, t.idempotencyKey),
  ],
);

export type StockTransfer = typeof stockTransfers.$inferSelect;
export type NewStockTransfer = typeof stockTransfers.$inferInsert;
export type StockTransferItem = typeof stockTransferItems.$inferSelect;
export type NewStockTransferItem = typeof stockTransferItems.$inferInsert;
export type StockTransferReceiptEvent = typeof stockTransferReceiptEvents.$inferSelect;
export type NewStockTransferReceiptEvent = typeof stockTransferReceiptEvents.$inferInsert;
