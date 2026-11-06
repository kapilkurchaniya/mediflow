import { pgTable, text, date, bigint, integer, uuid, boolean, timestamp, uniqueIndex, index, foreignKey, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt } from "./_helpers";
import { tenants, stores, users, memberships } from "./platform";
import { batches } from "./inventory";

/** Period controls enforcing fail-closed status and lock serialization for year-end cutoff. */
export const yearEndPeriodControls = pgTable(
  "year_end_period_controls",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    storeId: uuid("store_id").notNull(),
    fiscalYear: text("fiscal_year").notNull(), // e.g. "2024-2025"
    cutoffDate: timestamp("cutoff_date", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("open"), // 'open' | 'finalized'
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("period_controls_tenant_store_fy_uq").on(t.tenantId, t.storeId, t.fiscalYear),
    foreignKey({
      columns: [t.storeId],
      foreignColumns: [stores.id],
      name: "period_controls_store_fk",
    }).onDelete("restrict"),
    check("chk_period_ctrl_status", sql`${t.status} IN ('open', 'finalized')`),
    check(
      "chk_period_ctrl_integrity",
      sql`(${t.status} = 'open' AND ${t.finalizedAt} IS NULL) OR (${t.status} = 'finalized' AND ${t.finalizedAt} IS NOT NULL)`,
    ),
  ],
);

/** Year-end closing stock valuation snapshot header entity. */
export const yearEndStockSnapshots = pgTable(
  "year_end_stock_snapshots",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    storeId: uuid("store_id").notNull(),
    fiscalYear: text("fiscal_year").notNull(),
    cutoffDate: timestamp("cutoff_date", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("draft"), // 'draft' | 'finalized'
    totalUnits: bigint("total_units", { mode: "number" }).notNull().default(0),
    grossLandedCostPaise: bigint("gross_landed_cost_paise", { mode: "number" }).notNull().default(0),
    totalNrvPaise: bigint("total_nrv_paise", { mode: "number" }).notNull().default(0),
    finalValuationPaise: bigint("final_valuation_paise", { mode: "number" }).notNull().default(0),
    totalProvisionPaise: bigint("total_provision_paise", { mode: "number" }).notNull().default(0),
    valuationPolicyVersion: text("valuation_policy_version").notNull().default("ICDS_II_v1"),
    approvedBy: uuid("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("year_end_snapshots_tenant_store_fy_uq").on(t.tenantId, t.storeId, t.fiscalYear),
    uniqueIndex("year_end_snapshots_tenant_store_id_uq").on(t.tenantId, t.storeId, t.id),
    foreignKey({
      columns: [t.storeId],
      foreignColumns: [stores.id],
      name: "year_end_snapshots_store_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.approvedBy],
      foreignColumns: [users.id],
      name: "year_end_snapshots_approved_fk",
    }),
    check("chk_snapshot_status", sql`${t.status} IN ('draft', 'finalized')`),
    check(
      "chk_snapshot_aggregates",
      sql`${t.totalUnits} >= 0 AND ${t.totalUnits} <= 1000000000 AND ${t.grossLandedCostPaise} >= 0 AND ${t.grossLandedCostPaise} <= 1000000000000000 AND ${t.totalNrvPaise} >= 0 AND ${t.totalNrvPaise} <= 1000000000000000 AND ${t.finalValuationPaise} >= 0 AND ${t.finalValuationPaise} <= 1000000000000000 AND ${t.totalProvisionPaise} >= 0 AND ${t.totalProvisionPaise} <= 1000000000000000`,
    ),
  ],
);

/** Line items detailing batch valuation, NRV estimation, classification and provisions. */
export const yearEndStockItems = pgTable(
  "year_end_stock_items",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull(),
    storeId: uuid("store_id").notNull(),
    snapshotId: uuid("snapshot_id").notNull(),
    batchId: uuid("batch_id").notNull(),
    batchNumber: text("batch_number").notNull(),
    expiryDate: date("expiry_date").notNull(),
    grnNumber: text("grn_number"),
    supplierName: text("supplier_name"),
    canonicalUnit: text("canonical_unit").notNull().default("unit"),
    qty: integer("qty").notNull(),
    landedCostPaise: bigint("landed_cost_paise", { mode: "number" }).notNull().default(0),
    costValuePaise: bigint("cost_value_paise", { mode: "number" }).notNull().default(0),
    estimatedNrvPaise: bigint("estimated_nrv_paise", { mode: "number" }).notNull().default(0),
    nrvPaise: bigint("nrv_paise", { mode: "number" }).notNull().default(0),
    nrvBasis: text("nrv_basis").notNull().default("sales_history_90d"),
    nrvSource: text("nrv_source").notNull().default("sales_ledger"),
    evidenceRef: text("evidence_ref"),
    isOverridden: boolean("is_overridden").notNull().default(false),
    overrideReason: text("override_reason"),
    reviewedBy: uuid("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    finalValuationPaise: bigint("final_valuation_paise", { mode: "number" }).notNull().default(0),
    provisionPaise: bigint("provision_paise", { mode: "number" }).notNull().default(0),
    classification: text("classification").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("year_end_items_snapshot_batch_uq").on(t.tenantId, t.snapshotId, t.batchId),
    index("year_end_items_snapshot_idx").on(t.tenantId, t.storeId, t.snapshotId),
    foreignKey({
      columns: [t.storeId],
      foreignColumns: [stores.id],
      name: "year_end_items_store_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.tenantId, t.storeId, t.snapshotId],
      foreignColumns: [yearEndStockSnapshots.tenantId, yearEndStockSnapshots.storeId, yearEndStockSnapshots.id],
      name: "year_end_items_snapshot_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.batchId],
      foreignColumns: [batches.id],
      name: "year_end_items_batch_fk",
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.reviewedBy],
      foreignColumns: [users.id],
      name: "year_end_items_reviewed_fk",
    }),
    check("chk_qty_bounds", sql`${t.qty} >= 0 AND ${t.qty} <= 10000000`),
    check("chk_cost_bounds", sql`${t.landedCostPaise} >= 0 AND ${t.landedCostPaise} <= 100000000000`),
    check("chk_nrv_bounds", sql`${t.estimatedNrvPaise} >= 0 AND ${t.estimatedNrvPaise} <= 100000000000 AND ${t.nrvPaise} >= 0 AND ${t.nrvPaise} <= 100000000000`),
    check(
      "chk_classification_valid",
      sql`${t.classification} IN ('active', 'near_expiry', 'critical', 'expired', 'damaged', 'quarantined')`,
    ),
  ],
);

/** Single-use cryptographically hashed authorization grants for year-end snapshot finalization. */
export const yearEndAuthorizationGrants = pgTable(
  "year_end_authorization_grants",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    storeId: uuid("store_id").notNull(),
    fiscalYear: text("fiscal_year").notNull(),
    authorizedUserId: uuid("authorized_user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    action: text("action").notNull().default("finalize_year_end"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("uq_grant_token_hash").on(t.tokenHash),
    index("grants_lookup_idx").on(t.tenantId, t.storeId, t.fiscalYear, t.tokenHash),
    foreignKey({
      columns: [t.tenantId, t.authorizedUserId],
      foreignColumns: [memberships.tenantId, memberships.userId],
      name: "grants_membership_fk",
    }),
    check("chk_grant_ttl", sql`${t.expiresAt} > ${t.createdAt} AND ${t.expiresAt} <= ${t.createdAt} + interval '300 seconds'`),
    check("chk_grant_action", sql`${t.action} = 'finalize_year_end'`),
  ],
);
