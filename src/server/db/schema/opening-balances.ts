import { pgTable, text, date, bigint, integer, uuid, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";
import { id, createdAt } from "./_helpers";
import { tenants, stores, users } from "./platform";
import { journalEntries } from "./accounting";
import { batches, stockMovements } from "./inventory";

/** Authoritative opening balance records for parties and accounts. */
export const openingBalanceRecords = pgTable(
  "opening_balance_records",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    storeId: uuid("store_id"),
    entityType: text("entity_type").notNull(), // 'customer' | 'supplier' | 'inventory_snapshot' | 'account'
    entityId: uuid("entity_id").notNull(),
    asOfDate: date("as_of_date").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull().default(0),
    journalEntryId: uuid("journal_entry_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    status: text("status").notNull().default("posted"), // 'posted' | 'reversed'
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("opening_balances_tenant_entity_date_uq").on(t.tenantId, t.entityType, t.entityId, t.asOfDate),
    uniqueIndex("opening_balances_tenant_journal_uq").on(t.tenantId, t.journalEntryId),
    foreignKey({
      columns: [t.tenantId, t.storeId],
      foreignColumns: [stores.tenantId, stores.id],
      name: "opening_balances_tenant_store_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.tenantId, t.journalEntryId],
      foreignColumns: [journalEntries.tenantId, journalEntries.id],
      name: "opening_balances_tenant_journal_fk",
    }).onDelete("restrict"),
  ],
);

/** Store-level opening inventory cutover snapshot entity. */
export const openingInventorySnapshots = pgTable(
  "opening_inventory_snapshots",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    storeId: uuid("store_id").notNull(),
    asOfDate: date("as_of_date").notNull(),
    totalValuePaise: bigint("total_value_paise", { mode: "number" }).notNull().default(0),
    status: text("status").notNull().default("captured"), // 'captured' | 'posted'
    journalEntryId: uuid("journal_entry_id"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("opening_inv_snapshots_tenant_store_id_uq").on(t.tenantId, t.storeId, t.id),
    uniqueIndex("opening_inventory_snapshots_store_date_uq").on(t.tenantId, t.storeId, t.asOfDate),
    uniqueIndex("opening_inventory_snapshots_tenant_journal_uq").on(t.tenantId, t.journalEntryId),
    foreignKey({
      columns: [t.tenantId, t.storeId],
      foreignColumns: [stores.tenantId, stores.id],
      name: "opening_inv_snapshots_tenant_store_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.tenantId, t.journalEntryId],
      foreignColumns: [journalEntries.tenantId, journalEntries.id],
      name: "opening_inv_snapshots_tenant_journal_fk",
    }).onDelete("restrict"),
  ],
);

/** Immutable line items defining opening inventory snapshot membership with composite referential integrity. */
export const openingInventoryItems = pgTable(
  "opening_inventory_items",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    snapshotId: uuid("snapshot_id").notNull(),
    stockMovementId: bigint("stock_movement_id", { mode: "number" }).notNull(),
    batchId: uuid("batch_id").notNull(),
    storeId: uuid("store_id").notNull(),
    qty: integer("qty").notNull(),
    unitCostPaise: bigint("unit_cost_paise", { mode: "number" }).notNull().default(0),
    lineTotalPaise: bigint("line_total_paise", { mode: "number" }).notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("opening_inv_items_snapshot_movement_uq").on(t.snapshotId, t.stockMovementId),
    uniqueIndex("opening_inv_items_movement_uq").on(t.stockMovementId),
    foreignKey({
      columns: [t.tenantId, t.storeId],
      foreignColumns: [stores.tenantId, stores.id],
      name: "opening_inv_items_tenant_store_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.tenantId, t.storeId, t.snapshotId],
      foreignColumns: [openingInventorySnapshots.tenantId, openingInventorySnapshots.storeId, openingInventorySnapshots.id],
      name: "opening_inv_items_snapshot_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.tenantId, t.storeId, t.stockMovementId],
      foreignColumns: [stockMovements.tenantId, stockMovements.storeId, stockMovements.id],
      name: "opening_inv_items_movement_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.tenantId, t.storeId, t.batchId],
      foreignColumns: [batches.tenantId, batches.storeId, batches.id],
      name: "opening_inv_items_batch_fk",
    }).onDelete("restrict"),
  ],
);
