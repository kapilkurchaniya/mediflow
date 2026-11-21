/** Purchasing: suppliers, purchase orders, GRNs, returns, supplier schemes. (Lane B) */
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
import type { PendingSupplierMeta } from "@/lib/pending-supplier";
import { id, money, createdAt, updatedAt } from "./_helpers";
import { categories, medicines } from "./catalog";
import { batches } from "./inventory";
import { storeId, tenantId } from "./platform";

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    gstin: text("gstin"),
    stateCode: text("state_code"),
    drugLicenseNo: text("drug_license_no"),
    creditDays: integer("credit_days").notNull().default(30),
    leadTimeDays: integer("lead_time_days").notNull().default(2),
    openingBalance: money("opening_balance"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("suppliers_tenant_idx").on(t.tenantId)],
);

export const purchaseOrders = pgTable("purchase_orders", {
  id: id(),
  tenantId: tenantId(),
  storeId: storeId(),
  poNo: text("po_no").notNull(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  status: text("status").notNull().default("draft"), // draft | approved | sent | received | cancelled
  expectedDate: date("expected_date"),
  notes: text("notes"),
  estimatedTotal: money("estimated_total"),
  createdBy: uuid("created_by").notNull(),
  approvedBy: uuid("approved_by"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: id(),
  tenantId: tenantId(),
  purchaseOrderId: uuid("purchase_order_id").notNull().references(() => purchaseOrders.id, { onDelete: "cascade" }),
  medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
  qty: integer("qty").notNull(),
  freeQty: integer("free_qty").notNull().default(0),
  rate: money("rate"),
  receivedQty: integer("received_qty").notNull().default(0),
});

export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    purchaseNo: text("purchase_no").notNull(),
    supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
    supplierInvoiceNo: text("supplier_invoice_no").notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date"),
    status: text("status").notNull().default("posted"), // posted | cancelled
    isInterState: boolean("is_inter_state").notNull().default(false),
    grossAmount: money("gross_amount"),
    discountAmount: money("discount_amount"),
    tradeDiscountAmount: money("trade_discount_amount"),
    cashDiscountAmount: money("cash_discount_amount"),
    taxableAmount: money("taxable_amount"),
    cgst: money("cgst"),
    sgst: money("sgst"),
    igst: money("igst"),
    roundOff: money("round_off"),
    totalAmount: money("total_amount"),
    paidAmount: money("paid_amount"),
    returnedAmount: money("returned_amount"),
    pendingSupplierMeta: jsonb("pending_supplier_meta").$type<PendingSupplierMeta | null>(),
    notes: text("notes"),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("purchases_supplier_invoice_uq").on(t.tenantId, t.supplierId, t.supplierInvoiceNo),
    index("purchases_store_date_idx").on(t.storeId, t.invoiceDate),
  ],
);

export const purchaseItems = pgTable(
  "purchase_items",
  {
    id: id(),
    tenantId: tenantId(),
    purchaseId: uuid("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
    medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    batchNo: text("batch_no").notNull(),
    expiryDate: date("expiry_date").notNull(),
    qty: integer("qty").notNull(),
    freeQty: integer("free_qty").notNull().default(0),
    returnedQty: integer("returned_qty").notNull().default(0),
    rate: money("rate"), // excl. GST, per unit
    mrp: money("mrp"),
    saleRate: money("sale_rate"),
    unitsPerPack: integer("units_per_pack").notNull().default(1),
    packUnit: text("pack_unit").notNull().default("strip"),
    looseUnit: text("loose_unit").notNull().default("tablet"),
    schemeType: text("scheme_type"),
    discountBp: integer("discount_bp").notNull().default(0),
    tradeDiscountBp: integer("trade_discount_bp").notNull().default(0),
    cashDiscountBp: integer("cash_discount_bp").notNull().default(0),
    discountAmount: money("discount_amount"),
    cashDiscountAmount: money("cash_discount_amount"),
    taxableAmount: money("taxable_amount"),
    gstRateBp: integer("gst_rate_bp").notNull(),
    cgst: money("cgst"),
    sgst: money("sgst"),
    igst: money("igst"),
    totalAmount: money("total_amount"),
    landedUnitCost: money("landed_unit_cost"),
  },
  (t) => [index("purchase_items_purchase_idx").on(t.purchaseId), index("purchase_items_med_idx").on(t.medicineId)],
);

export const purchaseReturns = pgTable("purchase_returns", {
  id: id(),
  tenantId: tenantId(),
  storeId: storeId(),
  returnNo: text("return_no").notNull(),
  purchaseId: uuid("purchase_id").notNull().references(() => purchases.id),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id),
  taxableAmount: money("taxable_amount"),
  taxAmount: money("tax_amount"),
  totalAmount: money("total_amount"),
  reason: text("reason").notNull(),
  createdBy: uuid("created_by").notNull(),
  createdAt: createdAt(),
});

export const purchaseReturnItems = pgTable("purchase_return_items", {
  id: id(),
  tenantId: tenantId(),
  returnId: uuid("return_id").notNull().references(() => purchaseReturns.id, { onDelete: "cascade" }),
  purchaseItemId: uuid("purchase_item_id").notNull().references(() => purchaseItems.id),
  qty: integer("qty").notNull(),
  taxableAmount: money("taxable_amount"),
  taxAmount: money("tax_amount"),
  totalAmount: money("total_amount"),
});

export const schemes = pgTable(
  "schemes",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id"), // null = tenant-wide
    name: text("name").notNull(),
    schemeType: text("scheme_type").notNull(), // free_qty | percentage | flat | tiered
    supplierId: uuid("supplier_id").references(() => suppliers.id),
    medicineId: uuid("medicine_id").references(() => medicines.id),
    categoryId: uuid("category_id").references(() => categories.id),
    buyQty: integer("buy_qty").notNull().default(0), // for Buy X Get Y (e.g. 10)
    freeQty: integer("free_qty").notNull().default(0), // free qty (e.g. 1)
    discountBp: integer("discount_bp").notNull().default(0), // percentage discount (e.g. 500 = 5%)
    flatDiscount: money("flat_discount"), // flat discount in paise
    minQty: integer("min_qty").notNull().default(1), // minimum purchase qty to trigger
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("schemes_tenant_idx").on(t.tenantId, t.isActive),
    index("schemes_medicine_idx").on(t.medicineId),
    index("schemes_supplier_idx").on(t.supplierId),
    index("schemes_tenant_updated_idx").on(t.tenantId, t.updatedAt, t.id),
  ],
);

export type Scheme = typeof schemes.$inferSelect;
export type NewScheme = typeof schemes.$inferInsert;
