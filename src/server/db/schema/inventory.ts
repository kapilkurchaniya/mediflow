/** Inventory: batches and the immutable stock ledger. (Lane A) */
import {
  bigserial,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, money, createdAt } from "./_helpers";
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
  },
  (t) => [
    uniqueIndex("batches_store_med_batch_uq").on(t.storeId, t.medicineId, t.batchNo),
    index("batches_store_med_idx").on(t.storeId, t.medicineId),
    index("batches_expiry_idx").on(t.tenantId, t.expiryDate),
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
    createdAt: createdAt(),
  },
  (t) => [
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
