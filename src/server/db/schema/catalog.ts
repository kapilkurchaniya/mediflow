/** Catalog / master data: manufacturers, categories, racks, medicines. (Lane A) */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
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
    /** Numeric unit conversion factor (e.g. 10 tablets per strip). Base inventory math uses this. */
    unitsPerPack: integer("units_per_pack").notNull().default(1),
    packUnit: text("pack_unit").notNull().default("strip"),
    looseUnit: text("loose_unit").notNull().default("tablet"),
    manufacturerId: uuid("manufacturer_id").references(() => manufacturers.id),
    categoryId: uuid("category_id").references(() => categories.id),
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
    index("medicines_tenant_updated_idx").on(t.tenantId, t.updatedAt, t.id),
  ],
);

export const storeMedicineSettings = pgTable(
  "store_medicine_settings",
  {
    tenantId: tenantId(),
    storeId: storeId(),
    medicineId: uuid("medicine_id")
      .notNull()
      .references(() => medicines.id, { onDelete: "cascade" }),
    reorderLevel: integer("reorder_level"), // nullable: null inherits medicines.reorderLevel
    maxStock: integer("max_stock"), // nullable: null inherits medicines.maxStock
    rackId: uuid("rack_id").references(() => racks.id, { onDelete: "set null" }),
    salePriceOverride: bigint("sale_price_override", { mode: "number" }), // nullable: null inherits medicines.salePrice
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.medicineId], name: "store_medicine_settings_pk" }),
    index("idx_sms_tenant_store").on(t.tenantId, t.storeId),
    index("idx_sms_store_rack").on(t.storeId, t.rackId),
    index("sms_store_updated_idx").on(t.storeId, t.updatedAt, t.medicineId),
  ],
);

export type Rack = typeof racks.$inferSelect;
export type NewRack = typeof racks.$inferInsert;
export type Medicine = typeof medicines.$inferSelect;
export type NewMedicine = typeof medicines.$inferInsert;
export type StoreMedicineSetting = typeof storeMedicineSettings.$inferSelect;
export type NewStoreMedicineSetting = typeof storeMedicineSettings.$inferInsert;

/** Global / Tenant Indian Drug Master reference catalog (B1). */
export const drugMaster = pgTable(
  "drug_master",
  {
    id: id(),
    brandName: text("brand_name").notNull(),
    genericName: text("generic_name").notNull(),
    manufacturer: text("manufacturer"),
    hsn: text("hsn").notNull().default("30049099"),
    gstRateBp: integer("gst_rate_bp").notNull().default(1200),
    schedule: text("schedule").notNull().default("none"), // none | G | H | H1 | X | narcotic
    packSize: text("pack_size"),
    mrpPaise: bigint("mrp_paise", { mode: "number" }),
    isBannedFdc: boolean("is_banned_fdc").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("drug_master_brand_idx").on(t.brandName),
    index("drug_master_generic_idx").on(t.genericName),
  ],
);
