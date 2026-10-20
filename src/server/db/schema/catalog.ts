/** Catalog / master data: manufacturers, categories, racks, medicines. (Lane A) */
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, money, createdAt, updatedAt } from "./_helpers";
import { storeId, tenantId } from "./platform";

export const manufacturers = pgTable(
  "manufacturers",
  { id: id(), tenantId: tenantId(), name: text("name").notNull(), createdAt: createdAt() },
  (t) => [uniqueIndex("manufacturers_tenant_name_uq").on(t.tenantId, sql`lower(${t.name})`)],
);

export const categories = pgTable(
  "categories",
  { id: id(), tenantId: tenantId(), name: text("name").notNull(), createdAt: createdAt() },
  (t) => [uniqueIndex("categories_tenant_name_uq").on(t.tenantId, sql`lower(${t.name})`)],
);

export const racks = pgTable(
  "racks",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    code: text("code").notNull(), // "R1-S3" (Rack 1, Shelf 3)
    name: text("name").notNull(), // "Counter Left Rack"
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("racks_store_code_uq").on(t.storeId, sql`lower(${t.code})`),
    index("racks_tenant_store_idx").on(t.tenantId, t.storeId),
  ],
);

export const medicines = pgTable(
  "medicines",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    genericName: text("generic_name"),
    composition: text("composition"),
    strength: text("strength"),
    dosageForm: text("dosage_form"), // tablet | capsule | syrup | injection | ...
    packSize: text("pack_size"), // "15 tablets", "100 ml"
    unit: text("unit").notNull().default("strip"),
    manufacturerId: uuid("manufacturer_id").references(() => manufacturers.id),
    categoryId: uuid("category_id").references(() => categories.id),
    rackId: uuid("rack_id").references(() => racks.id),
    barcode: text("barcode"),
    hsn: text("hsn"),
    gstRateBp: integer("gst_rate_bp").notNull().default(500), // GST 2.0: most pharma HSN 3003/3004 @ 5%
    mrp: money("mrp"),
    salePrice: money("sale_price"),
    purchasePrice: money("purchase_price"),
    rxRequired: boolean("rx_required").notNull().default(false),
    schedule: text("schedule").notNull().default("none"), // none | G | H | H1 | X | narcotic
    reorderLevel: integer("reorder_level").notNull().default(10),
    maxStock: integer("max_stock").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("medicines_tenant_barcode_uq").on(t.tenantId, t.barcode).where(sql`${t.barcode} is not null`),
    index("medicines_tenant_idx").on(t.tenantId, t.isActive),
    index("medicines_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
    index("medicines_generic_trgm").using("gin", sql`coalesce(${t.genericName}, '') gin_trgm_ops`),
  ],
);

export type Rack = typeof racks.$inferSelect;
export type NewRack = typeof racks.$inferInsert;
