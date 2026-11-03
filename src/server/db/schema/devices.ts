import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id } from "./_helpers";
import { stores, storeId, tenantId, users } from "./platform";

/**
 * Enrolled counter workstations, desktop terminals (Tauri), or browser PWAs.
 *
 * Each device belongs to one store and is allocated a permanent 2-character
 * code ([0-9A-Z]{2}) used as the prefix for offline invoice series:
 *   sale:dev<CODE> (e.g. sale:dev01, sale:devA1)
 *
 * Auth: Pairing tokens (mf_dev_<64hex>) are hashed with sha256. Raw tokens
 * are never stored. Sync endpoints authenticate via Bearer <token>.
 */
export const devices = pgTable(
  "devices",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    platform: text("platform").notNull().default("browser"),
    appVersion: text("app_version"),
    tokenHash: text("token_hash").notNull(),
    tokenRotatedAt: timestamp("token_rotated_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("devices_store_code_uq").on(t.storeId, t.code),
    uniqueIndex("devices_token_hash_uq").on(t.tokenHash),
    index("devices_tenant_store_idx").on(t.tenantId, t.storeId),
    check(
      "devices_code_format_check",
      sql`length(${t.code}) = 2 AND ${t.code} ~ '^[0-9A-Z]{2}$'`,
    ),
    check(
      "devices_platform_check",
      sql`${t.platform} IN ('browser', 'desktop', 'mobile')`,
    ),
    foreignKey({
      columns: [t.tenantId, t.storeId],
      foreignColumns: [stores.tenantId, stores.id],
      name: "devices_tenant_store_fk",
    }).onDelete("restrict"),
  ],
);

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;

/**
 * Pre-allocated sequence number blocks reserved for offline billing terminals.
 * Tied permanently to device, store, and financial year.
 */
export const deviceInvoiceReservations = pgTable(
  "device_invoice_reservations",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    clientReservationId: text("client_reservation_id").notNull(),
    fiscalYear: text("fiscal_year").notNull(),
    startSeq: integer("start_seq").notNull(),
    endSeq: integer("end_seq").notNull(),
    count: integer("count").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("dev_inv_res_client_uq").on(t.deviceId, t.clientReservationId),
    index("dev_inv_res_range_idx").on(t.deviceId, t.fiscalYear, t.startSeq, t.endSeq),
    index("dev_inv_res_tenant_store_idx").on(t.tenantId, t.storeId),
    foreignKey({
      columns: [t.tenantId, t.storeId],
      foreignColumns: [stores.tenantId, stores.id],
      name: "dev_inv_res_tenant_store_fk",
    }).onDelete("restrict"),
  ],
);

export type DeviceInvoiceReservation = typeof deviceInvoiceReservations.$inferSelect;
export type NewDeviceInvoiceReservation = typeof deviceInvoiceReservations.$inferInsert;

/**
 * Device-scoped idempotency table with SHA-256 payload hashing.
 * Guarantees duplicate submissions return the original response while rejecting
 * mutated payloads with IDEMPOTENCY_PAYLOAD_MISMATCH.
 */
export const deviceSyncIdempotency = pgTable(
  "device_sync_idempotency",
  {
    id: id(),
    tenantId: tenantId(),
    storeId: storeId(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    clientOperationId: text("client_operation_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    response: jsonb("response").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("dev_sync_idemp_uq").on(t.tenantId, t.deviceId, t.scope, t.clientOperationId),
    index("dev_sync_idemp_created_idx").on(t.tenantId, t.createdAt),
    foreignKey({
      columns: [t.tenantId, t.storeId],
      foreignColumns: [stores.tenantId, stores.id],
      name: "dev_sync_idemp_tenant_store_fk",
    }).onDelete("restrict"),
  ],
);

export type DeviceSyncIdempotency = typeof deviceSyncIdempotency.$inferSelect;
export type NewDeviceSyncIdempotency = typeof deviceSyncIdempotency.$inferInsert;
