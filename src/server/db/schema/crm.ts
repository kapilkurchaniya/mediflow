/** CRM: customers, family groups, loyalty, medical reps, promise and external orders. (Lane B) */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, money, createdAt, updatedAt } from "./_helpers";
import { medicines } from "./catalog";
import { storeId, stores, tenantId } from "./platform";
import { purchaseOrders } from "./purchasing";
import { sales } from "./sales";

export const customerGroups = pgTable(
  "customer_groups",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(), // e.g. "Sharma Family"
    primaryCustomerId: uuid("primary_customer_id"), // head of household
    creditLimit: money("credit_limit"), // pooled family credit limit
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [index("customer_groups_tenant_idx").on(t.tenantId)],
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
    stateCode: text("state_code"),
    groupId: uuid("group_id").references(() => customerGroups.id),
    creditLimit: money("credit_limit"),
    openingBalance: money("opening_balance"),
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    notes: text("notes"),
    age: integer("age"),
    gender: text("gender"), // male | female | other
    doctorName: text("doctor_name"),
    doctorRegNo: text("doctor_reg_no"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("customers_tenant_idx").on(t.tenantId),
    index("customers_phone_idx").on(t.tenantId, t.phone),
    index("customers_group_idx").on(t.groupId),
    index("customers_tenant_updated_idx").on(t.tenantId, t.updatedAt, t.id),
  ],
);

export const medicalReps = pgTable(
  "medical_reps",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    companyName: text("company_name"),
    commissionRateBp: integer("commission_rate_bp").notNull().default(0), // basis points (e.g. 200 = 2.0%)
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("medical_reps_tenant_idx").on(t.tenantId, t.isActive)],
);

export const promiseOrders = pgTable(
  "promise_orders",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    customerId: uuid("customer_id").references(() => customers.id),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    medicineId: uuid("medicine_id").references(() => medicines.id),
    medicineName: text("medicine_name").notNull(),
    qtyRequested: integer("qty_requested").notNull(),
    status: text("status").notNull().default("pending"), // pending | ordered | fulfilled | cancelled
    saleId: uuid("sale_id").references(() => sales.id),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
    notes: text("notes"),
    promisedDate: date("promised_date"),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("promise_orders_tenant_status_idx").on(t.tenantId, t.status),
    index("promise_orders_store_idx").on(t.storeId, t.status),
    index("promise_orders_medicine_idx").on(t.medicineId),
  ],
);

export const loyaltyConfigs = pgTable("loyalty_configs", {
  id: id(),
  tenantId: tenantId(),
  pointsPerRupee: integer("points_per_rupee").notNull().default(1), // 1 point per ₹100 spent (can be scaled)
  redemptionValuePaise: integer("redemption_value_paise").notNull().default(100), // 1 point = 100 paise = ₹1.00
  minRedemptionPoints: integer("min_redemption_points").notNull().default(10), // minimum points required to redeem
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const loyaltyTransactions = pgTable(
  "loyalty_transactions",
  {
    id: id(),
    tenantId: tenantId(),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // earn | redeem | expire | adjust
    points: integer("points").notNull(), // positive for earn/adjust, negative for redeem/expire
    balanceAfter: integer("balance_after").notNull(),
    saleId: uuid("sale_id").references(() => sales.id),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("loyalty_tx_customer_idx").on(t.customerId, t.createdAt),
    index("loyalty_tx_tenant_idx").on(t.tenantId),
  ],
);

export const externalOrders = pgTable(
  "external_orders",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id").references(() => stores.id),
    source: text("source").notNull().default("whatsapp"), // whatsapp | eretail | phone | web
    orderNo: text("order_no").notNull(),
    customerId: uuid("customer_id").references(() => customers.id),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    status: text("status").notNull().default("received"), // received | accepted | preparing | ready | delivered | cancelled
    items: jsonb("items").notNull(), // Array<{ medicineId: string; name: string; qty: number; rate: number }>
    totalAmount: money("total_amount"), // paise
    notes: text("notes"),
    saleId: uuid("sale_id").references(() => sales.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("ext_orders_tenant_status_idx").on(t.tenantId, t.status),
    index("ext_orders_customer_phone_idx").on(t.tenantId, t.customerPhone),
  ],
);

export type PromiseOrder = typeof promiseOrders.$inferSelect;
export type NewPromiseOrder = typeof promiseOrders.$inferInsert;
export type MedicalRep = typeof medicalReps.$inferSelect;
export type NewMedicalRep = typeof medicalReps.$inferInsert;
export type CustomerGroup = typeof customerGroups.$inferSelect;
export type NewCustomerGroup = typeof customerGroups.$inferInsert;
export type LoyaltyConfig = typeof loyaltyConfigs.$inferSelect;
export type NewLoyaltyConfig = typeof loyaltyConfigs.$inferInsert;
export type LoyaltyTransaction = typeof loyaltyTransactions.$inferSelect;
export type NewLoyaltyTransaction = typeof loyaltyTransactions.$inferInsert;
export type ExternalOrder = typeof externalOrders.$inferSelect;
export type NewExternalOrder = typeof externalOrders.$inferInsert;
