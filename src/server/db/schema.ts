/**
 * MediFlow database schema.
 *
 * Conventions
 * - Every business table carries tenant_id; store-scoped tables also carry store_id.
 * - Money is stored as integer PAISE (bigint mode "number"; safe up to ~9e15 paise).
 * - Percentages are stored in BASIS POINTS (1200 = 12.00%).
 * - Stock quantities are integers in selling units (strip / bottle / pack).
 * - Stock is never edited directly: every change writes a stock_movements row and updates
 *   batches.qty_on_hand inside the same transaction.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const tenantId = () => uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" });
const storeId = () => uuid("store_id").notNull().references(() => stores.id);
const money = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ───────────────────────────── Platform / tenancy ───────────────────────────── */

export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  gstin: text("gstin"),
  stateCode: text("state_code"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  plan: text("plan").notNull().default("starter"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    pharmacistRegNo: text("pharmacist_reg_no"),
    passwordHash: text("password_hash").notNull(),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

export const stores = pgTable(
  "stores",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    address: text("address"),
    city: text("city"),
    stateCode: text("state_code").notNull(),
    pincode: text("pincode"),
    phone: text("phone"),
    gstin: text("gstin"),
    drugLicenseNo: text("drug_license_no"),
    invoicePrefix: text("invoice_prefix").notNull().default("INV"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("stores_tenant_code_uq").on(t.tenantId, t.code)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the opaque token stored in the cookie — the raw token is never persisted. */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const roles = pgTable(
  "roles",
  {
    id: id(),
    tenantId: tenantId(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("roles_tenant_key_uq").on(t.tenantId, t.key)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    status: text("status").notNull().default("active"), // active | suspended
    allStores: boolean("all_stores").notNull().default(true),
    storeIds: uuid("store_ids").array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_tenant_user_uq").on(t.tenantId, t.userId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    storeId: uuid("store_id"),
    userId: uuid("user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    reason: text("reason"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("audit_entity_idx").on(t.tenantId, t.entityType, t.entityId),
  ],
);

/** Gap-free per-store document numbering (invoice, PO, returns, journals). Row-locked on use. */
export const docSequences = pgTable(
  "doc_sequences",
  {
    tenantId: tenantId(),
    storeId: uuid("store_id").notNull(),
    docType: text("doc_type").notNull(),
    fiscalYear: text("fiscal_year").notNull(),
    nextValue: integer("next_value").notNull().default(1),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.storeId, t.docType, t.fiscalYear] })],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    tenantId: tenantId(),
    key: text("key").notNull(),
    scope: text("scope").notNull(),
    response: jsonb("response").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.scope, t.key] })],
);

/* ───────────────────────────── Master data ───────────────────────────── */

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
    barcode: text("barcode"),
    hsn: text("hsn"),
    gstRateBp: integer("gst_rate_bp").notNull().default(1200),
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

export const customers = pgTable(
  "customers",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    gstin: text("gstin"),
    creditLimit: money("credit_limit"),
    openingBalance: money("opening_balance"),
    notes: text("notes"),
    age: integer("age"),
    gender: text("gender"), // male | female | other
    doctorName: text("doctor_name"),
    doctorRegNo: text("doctor_reg_no"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index("customers_tenant_idx").on(t.tenantId),
    index("customers_phone_idx").on(t.tenantId, t.phone),
  ],
);

export const doctors = pgTable(
  "doctors",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    regNo: text("reg_no").notNull(),
    qualification: text("qualification"),
    specialization: text("specialization"),
    hospital: text("hospital"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("doctors_tenant_reg_uq").on(t.tenantId, sql`lower(${t.regNo})`),
    index("doctors_tenant_name_idx").on(t.tenantId, sql`lower(${t.name})`),
  ],
);

export const prescriptions = pgTable(
  "prescriptions",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    customerId: uuid("customer_id").references(() => customers.id),
    patientName: text("patient_name").notNull(),
    patientAge: integer("patient_age"),
    patientGender: text("patient_gender"), // male | female | other
    patientPhone: text("patient_phone"),
    patientAddress: text("patient_address"),
    doctorId: uuid("doctor_id").references(() => doctors.id),
    doctorName: text("doctor_name").notNull(),
    doctorRegNo: text("doctor_reg_no"),
    doctorAddress: text("doctor_address"),
    rxNumber: text("rx_number"),
    prescriptionDate: date("prescription_date").notNull(),
    diagnosis: text("diagnosis"),
    notes: text("notes"),
    imageUrl: text("image_url"),
    status: text("status").notNull().default("active"), // active | partially_dispensed | fully_dispensed | cancelled
    validUntil: date("valid_until"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("prescriptions_store_idx").on(t.storeId, t.prescriptionDate),
    index("prescriptions_customer_idx").on(t.customerId),
  ],
);

export const prescriptionItems = pgTable(
  "prescription_items",
  {
    id: id(),
    tenantId: tenantId(),
    prescriptionId: uuid("prescription_id").notNull().references(() => prescriptions.id, { onDelete: "cascade" }),
    medicineId: uuid("medicine_id").references(() => medicines.id),
    medicineName: text("medicine_name").notNull(),
    dosage: text("dosage"),
    frequency: text("frequency"),
    durationDays: integer("duration_days"),
    quantityPrescribed: integer("quantity_prescribed").notNull(),
    quantityDispensed: integer("quantity_dispensed").notNull().default(0),
    instructions: text("instructions"),
  },
  (t) => [index("prescription_items_rx_idx").on(t.prescriptionId)],
);

/* ───────────────────────────── Inventory ───────────────────────────── */

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

/* ───────────────────────────── Sales ───────────────────────────── */

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

/* ───────────────────────────── Compliance / Statutory Registers ───────────────────────────── */

export const dispensingLogs = pgTable(
  "dispensing_logs",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    saleId: uuid("sale_id").notNull().references(() => sales.id, { onDelete: "cascade" }),
    saleItemId: uuid("sale_item_id").notNull().references(() => saleItems.id, { onDelete: "cascade" }),
    medicineId: uuid("medicine_id").notNull().references(() => medicines.id),
    batchId: uuid("batch_id").notNull().references(() => batches.id),
    medicineName: text("medicine_name").notNull(),
    batchNo: text("batch_no").notNull(),
    expiryDate: date("expiry_date").notNull(),
    manufacturerName: text("manufacturer_name"),
    schedule: text("schedule").notNull(), // H | H1 | X | narcotic
    patientName: text("patient_name").notNull(),
    patientAge: integer("patient_age"),
    patientGender: text("patient_gender"),
    patientAddress: text("patient_address"),
    patientPhone: text("patient_phone"),
    doctorName: text("doctor_name").notNull(),
    doctorRegNo: text("doctor_reg_no"),
    doctorAddress: text("doctor_address"),
    prescriptionRef: text("prescription_ref"),
    prescriptionDate: date("prescription_date"),
    quantityDispensed: integer("quantity_dispensed").notNull(),
    pharmacistId: uuid("pharmacist_id").references(() => users.id),
    pharmacistName: text("pharmacist_name"),
    pharmacistRegNo: text("pharmacist_reg_no"),
    statutoryRegister: text("statutory_register").notNull(), // schedule_h | schedule_h1 | schedule_x | narcotics
    dispensedAt: timestamp("dispensed_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("dispensing_logs_reg_idx").on(t.storeId, t.statutoryRegister, t.dispensedAt),
    index("dispensing_logs_med_idx").on(t.medicineId, t.dispensedAt),
    index("dispensing_logs_sale_idx").on(t.saleId),
  ],
);

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

/* ───────────────────────────── Purchases ───────────────────────────── */

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
    taxableAmount: money("taxable_amount"),
    cgst: money("cgst"),
    sgst: money("sgst"),
    igst: money("igst"),
    roundOff: money("round_off"),
    totalAmount: money("total_amount"),
    paidAmount: money("paid_amount"),
    returnedAmount: money("returned_amount"),
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
    discountBp: integer("discount_bp").notNull().default(0),
    discountAmount: money("discount_amount"),
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

/* ───────────────────────────── Accounting ───────────────────────────── */

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    tenantId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(), // asset | liability | equity | income | expense
    systemKey: text("system_key"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("accounts_tenant_code_uq").on(t.tenantId, t.code),
    uniqueIndex("accounts_tenant_syskey_uq").on(t.tenantId, t.systemKey).where(sql`${t.systemKey} is not null`),
  ],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id"),
    entryNo: text("entry_no").notNull(),
    entryDate: date("entry_date").notNull(),
    narration: text("narration").notNull(),
    refType: text("ref_type"),
    refId: uuid("ref_id"),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("journal_tenant_date_idx").on(t.tenantId, t.entryDate), index("journal_ref_idx").on(t.refType, t.refId)],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantId(),
    entryId: uuid("entry_id").notNull().references(() => journalEntries.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    debit: money("debit"),
    credit: money("credit"),
    partyType: text("party_type"), // customer | supplier
    partyId: uuid("party_id"),
  },
  (t) => [
    index("journal_lines_account_idx").on(t.tenantId, t.accountId),
    index("journal_lines_party_idx").on(t.partyType, t.partyId),
    index("journal_lines_entry_idx").on(t.entryId),
  ],
);

/** Receipts from customers (direction=in) and payments to suppliers / expenses (direction=out). */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    paymentNo: text("payment_no").notNull(),
    direction: text("direction").notNull(), // in | out
    partyType: text("party_type"), // customer | supplier | expense
    partyId: uuid("party_id"),
    expenseAccountId: uuid("expense_account_id").references(() => accounts.id),
    method: text("method").notNull(), // cash | upi | card | bank
    amount: money("amount"),
    reference: text("reference"),
    paymentDate: date("payment_date").notNull(),
    note: text("note"),
    journalEntryId: uuid("journal_entry_id").references(() => journalEntries.id),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("payments_party_idx").on(t.partyType, t.partyId)],
);

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

/* ───────────────────────────── Events / notifications / AI ───────────────────────────── */

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tenantId: tenantId(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"), // pending | done | failed
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    createdAt: createdAt(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("outbox_pending_idx").on(t.status, t.id)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id"),
    type: text("type").notNull(),
    severity: text("severity").notNull().default("info"), // info | warning | critical
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_tenant_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("notifications_dedupe_uq").on(t.tenantId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

export const aiActions = pgTable(
  "ai_actions",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id"),
    userId: uuid("user_id").notNull(),
    channel: text("channel").notNull().default("chat"), // chat | voice
    input: text("input").notNull(),
    intent: text("intent"),
    tool: text("tool"),
    arguments: jsonb("arguments"),
    result: jsonb("result"),
    safetyLevel: integer("safety_level").notNull().default(1),
    status: text("status").notNull().default("done"), // done | pending_confirmation | confirmed | cancelled | rejected | error
    model: text("model"),
    latencyMs: integer("latency_ms"),
    approvedBy: uuid("approved_by"),
    createdAt: createdAt(),
  },
  (t) => [index("ai_actions_tenant_idx").on(t.tenantId, t.createdAt)],
);
