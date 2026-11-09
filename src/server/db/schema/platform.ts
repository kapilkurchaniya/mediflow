/** Platform / tenancy: tenants, users, stores, sessions, roles, audit, numbering. (Lane A) */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
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
import { id, createdAt } from "./_helpers";

/** FK column to tenants. Defined here (not in _helpers) because it references the tenants table. */
export const tenantId = () => uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" });
export const storeId = () => uuid("store_id").notNull().references(() => stores.id);

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
    pharmacistRegExpiry: date("pharmacist_reg_expiry"),
    pharmacistCouncilState: text("pharmacist_council_state"),
    passwordHash: text("password_hash").notNull(),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

export type StoreKind = "retail" | "warehouse";

export interface StoreSettings {
  requireShift?: boolean;
  maxDiscountBp?: number;
  printFormat?: "thermal_80mm" | "thermal_58mm" | "a4";
  defaultPaymentMethod?: "cash" | "upi" | "card" | "credit";
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  requireShift: false,
  printFormat: "thermal_80mm",
  defaultPaymentMethod: "cash",
};

export const stores = pgTable(
  "stores",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    kind: text("kind").$type<StoreKind>().notNull().default("retail"),
    address: text("address"),
    city: text("city"),
    stateCode: text("state_code").notNull(),
    pincode: text("pincode"),
    phone: text("phone"),
    gstin: text("gstin"),
    drugLicenseNo: text("drug_license_no"),
    drugLicenseExpiry: date("drug_license_expiry"),
    form20No: text("form20_no"),
    form20Expiry: date("form20_expiry"),
    form21No: text("form21_no"),
    form21Expiry: date("form21_expiry"),
    form20bNo: text("form20b_no"),
    form20bExpiry: date("form20b_expiry"),
    form21bNo: text("form21b_no"),
    form21bExpiry: date("form21b_expiry"),
    fssaiNo: text("fssai_no"),
    fssaiExpiry: date("fssai_expiry"),
    chiefPharmacistId: uuid("chief_pharmacist_id").references(() => users.id, { onDelete: "set null" }),
    invoicePrefix: text("invoice_prefix").notNull().default("INV"),
    isActive: boolean("is_active").notNull().default(true),
    settings: jsonb("settings").$type<StoreSettings>().notNull().default(DEFAULT_STORE_SETTINGS),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("stores_tenant_code_uq").on(t.tenantId, t.code),
    uniqueIndex("stores_tenant_id_uq").on(t.tenantId, t.id),
    check("stores_kind_check", sql`${t.kind} IN ('retail', 'warehouse')`),
  ],
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
    /** The store this member last signed in to; the next login starts there if it is still allowed. */
    lastStoreId: uuid("last_store_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_tenant_user_uq").on(t.tenantId, t.userId)],
);

/**
 * Invitations to join a pharmacy (ROADMAP A1.4). The invite link carries a random token; only its sha256 is stored,
 * so a database leak cannot be turned into working links.
 */
export const userInvites = pgTable(
  "user_invites",
  {
    id: id(),
    tenantId: tenantId(),
    email: text("email").notNull(),
    roleId: uuid("role_id").notNull().references(() => roles.id),
    allStores: boolean("all_stores").notNull().default(true),
    storeIds: uuid("store_ids").array().notNull().default(sql`'{}'::uuid[]`),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("user_invites_token_uq").on(t.tokenHash), index("user_invites_tenant_email_idx").on(t.tenantId, t.email)],
);

/**
 * Every sign-in attempt (successful or not), used to lock an email out for 15 minutes after 10 failures.
 * Holds no password and no tenant: it is looked up by email before we know who the user is.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    emailLower: text("email_lower").notNull(),
    ip: text("ip"),
    success: boolean("success").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_email_created_idx").on(t.emailLower, t.createdAt)],
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

/**
 * API keys for machine-to-machine access to /api/v1/*.
 *
 * The raw key (format: mf_live_<32 random bytes hex>) is shown to the user
 * ONCE at creation and never stored. Only the sha256 hex digest is persisted.
 *
 * scopes: ["stock.read", "orders.write", "orders.read"]
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    tenantId: tenantId(),
    /** Optional — if set the key can only access this store's data. */
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    /** sha256(rawKey) — hex encoded. Never store the raw key. */
    keyHash: text("key_hash").notNull(),
    /** e.g. ["stock.read", "orders.write"] */
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("api_keys_hash_uq").on(t.keyHash),
    index("api_keys_tenant_idx").on(t.tenantId),
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
