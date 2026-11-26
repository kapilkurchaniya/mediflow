/** Onboarding data migration from Marg ERP & other software. (Lane B Task B4.1) */
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, createdAt, money } from "./_helpers";
import { stores, tenantId, users } from "./platform";
import { medicines } from "./catalog";

export interface ImportJobTotals {
  rows: number;
  valid: number;
  errors: number;
  created: number;
  updated: number;
  skipped: number;
}

export interface ImportRowError {
  field: string;
  message: string;
  code?: string;
  value?: unknown;
}

export const importJobs = pgTable(
  "import_jobs",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id").references(() => stores.id),
    entity: text("entity").notNull(), // medicines | batches | customers | suppliers | doctors
    source: text("source").notNull().default("generic"), // marg | gofrugal | generic
    fileName: text("file_name").notNull(),
    status: text("status").notNull().default("uploaded"), // uploaded | mapped | validated | committing | done | failed
    mapping: jsonb("mapping").$type<Record<string, string>>().notNull().default({}),
    totals: jsonb("totals")
      .$type<ImportJobTotals>()
      .notNull()
      .default({ rows: 0, valid: 0, errors: 0, created: 0, updated: 0, skipped: 0 }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("import_jobs_tenant_status_idx").on(t.tenantId, t.status),
    index("import_jobs_tenant_created_idx").on(t.tenantId, t.createdAt),
  ]
);

export const importJobRows = pgTable(
  "import_job_rows",
  {
    id: id(),
    tenantId: tenantId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    rowNo: integer("row_no").notNull(),
    raw: jsonb("raw").$type<Record<string, string>>().notNull(),
    normalized: jsonb("normalized").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("pending"), // pending | valid | error | skipped | committed
    errors: jsonb("errors").$type<ImportRowError[]>().notNull().default([]),
    targetId: uuid("target_id"),
    externalRef: text("external_ref"),
  },
  (t) => [
    index("import_job_rows_job_status_idx").on(t.jobId, t.status),
    index("import_job_rows_job_row_idx").on(t.jobId, t.rowNo),
    index("import_job_rows_tenant_ext_idx").on(t.tenantId, t.externalRef),
  ]
);

export type ImportJob = typeof importJobs.$inferSelect;
export type NewImportJob = typeof importJobs.$inferInsert;
export type ImportJobRow = typeof importJobRows.$inferSelect;
export type NewImportJobRow = typeof importJobRows.$inferInsert;

/** Persistent distributor item -> internal medicine mapping memory (C3). */
export const supplierItemMap = pgTable(
  "supplier_item_map",
  {
    id: id(),
    tenantId: tenantId(),
    supplierId: uuid("supplier_id"),
    externalItemCode: text("external_item_code"),
    externalItemName: text("external_item_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    medicineId: uuid("medicine_id")
      .notNull()
      .references(() => medicines.id, { onDelete: "cascade" }),
    lastPurchaseRate: money("last_purchase_rate"),
    useCount: integer("use_count").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("supplier_item_map_uq").on(t.tenantId, t.supplierId, t.normalizedName),
    index("supplier_item_map_med_idx").on(t.tenantId, t.medicineId),
  ],
);

