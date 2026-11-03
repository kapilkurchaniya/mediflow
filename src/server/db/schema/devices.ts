import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id } from "./_helpers";
import { stores, tenantId, users } from "./platform";

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
  ],
);

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
