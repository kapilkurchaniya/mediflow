import { and, asc, eq, gte, lte, or, sql, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import { schema, type DbOrTx } from "@/server/db";
import type { DeviceAuthCtx } from "@/server/domain/devices/types";
import type {
  SyncEntityPage,
  SyncEntityPageParam,
  SyncPullResponse,
} from "./types";

interface CursorParts {
  cursorTs: string;
  id: string;
}

function parseCursor(cursor?: string): CursorParts | null {
  if (!cursor) return null;
  const idx = cursor.indexOf("_");
  if (idx === -1) return null;
  const cursorTs = cursor.slice(0, idx);
  const id = cursor.slice(idx + 1);
  if (!cursorTs || !id) return null;
  return { cursorTs, id };
}

const emptyPage = <T>(): SyncEntityPage<T> => ({
  items: [],
  nextCursor: null,
  hasMore: false,
});

async function paginateTable(
  db: DbOrTx,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: PgTable<any>,
  baseConds: (SQL | undefined)[],
  updatedAtCol: PgColumn,
  idCol: PgColumn,
  cursor: CursorParts | null,
  limit: number,
  extraOrderCol?: PgColumn,
): Promise<SyncEntityPage<Record<string, unknown>>> {
  const conds = [...baseConds];
  if (cursor) {
    conds.push(
      or(
        sql`${updatedAtCol} > ${cursor.cursorTs}::timestamptz`,
        and(
          sql`${updatedAtCol} = ${cursor.cursorTs}::timestamptz`,
          sql`${idCol} > ${cursor.id}`,
        ),
      ),
    );
  }
  const orderClauses = [asc(updatedAtCol)];
  if (extraOrderCol) orderClauses.push(asc(extraOrderCol));
  orderClauses.push(asc(idCol));

  const rows = await db
    .select({
      record: table,
      cursorTs: sql<string>`to_char(${updatedAtCol}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
    })
    .from(table)
    .where(and(...conds.filter(Boolean)))
    .orderBy(...orderClauses)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const items = sliced.map((r) => r.record) as Record<string, unknown>[];
  const last = sliced[sliced.length - 1];
  let nextCursor: string | null = null;
  if (hasMore && last) {
    const rawRecord = last.record as Record<string, unknown>;
    const rawId = (rawRecord.id ?? rawRecord.medicineId ?? rawRecord.code) as string;
    if (last.cursorTs && rawId) {
      nextCursor = `${last.cursorTs}_${rawId}`;
    }
  }

  return {
    items,
    hasMore,
    nextCursor,
  };
}

/**
 * Delta synchronization pull engine with fixed session boundaries and per-entity pagination.
 */
export async function pullSyncDeltas(
  db: DbOrTx,
  deviceCtx: DeviceAuthCtx,
  params: SyncEntityPageParam,
): Promise<SyncPullResponse> {
  const serverTime = new Date().toISOString();
  // Safe upper bound: if client didn't fix snapshotTime, provide a 5s buffer to avoid docker clock drift
  const snapshotTime = params.snapshotTime ?? new Date(Date.now() + 5000).toISOString();
  const snapshotDate = new Date(snapshotTime);
  const sessionId = params.sessionId ?? crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // 30s overlap buffer for safety against clock skew or in-flight commits
  const effectiveSince = params.since
    ? new Date(new Date(params.since).getTime() - 30 * 1000)
    : null;

  const limit = Math.min(params.limit ?? 500, 2000);
  const cursor = parseCursor(params.cursor);
  const target = params.entity;

  // 1. Medicines
  const medicinesPage = (!target || target === "medicines")
    ? await paginateTable(
        db,
        schema.medicines,
        [
          eq(schema.medicines.tenantId, deviceCtx.tenantId),
          lte(schema.medicines.updatedAt, snapshotDate),
          effectiveSince ? gte(schema.medicines.updatedAt, effectiveSince) : undefined,
        ],
        schema.medicines.updatedAt,
        schema.medicines.id,
        cursor,
        limit,
      )
    : emptyPage<Record<string, unknown>>();

  // 2. Batches
  const batchesPage = (!target || target === "batches")
    ? await paginateTable(
        db,
        schema.batches,
        [
          eq(schema.batches.tenantId, deviceCtx.tenantId),
          eq(schema.batches.storeId, deviceCtx.storeId),
          lte(schema.batches.updatedAt, snapshotDate),
          effectiveSince ? gte(schema.batches.updatedAt, effectiveSince) : undefined,
        ],
        schema.batches.updatedAt,
        schema.batches.id,
        cursor,
        limit,
      )
    : emptyPage<Record<string, unknown>>();

  // 3. Customers
  const customersPage = (!target || target === "customers")
    ? await paginateTable(
        db,
        schema.customers,
        [
          eq(schema.customers.tenantId, deviceCtx.tenantId),
          lte(schema.customers.updatedAt, snapshotDate),
          effectiveSince ? gte(schema.customers.updatedAt, effectiveSince) : undefined,
        ],
        schema.customers.updatedAt,
        schema.customers.id,
        cursor,
        limit,
      )
    : emptyPage<Record<string, unknown>>();

  // 4. Doctors
  const doctorsPage = (!target || target === "doctors")
    ? await paginateTable(
        db,
        schema.doctors,
        [
          eq(schema.doctors.tenantId, deviceCtx.tenantId),
          lte(schema.doctors.updatedAt, snapshotDate),
          effectiveSince ? gte(schema.doctors.updatedAt, effectiveSince) : undefined,
        ],
        schema.doctors.updatedAt,
        schema.doctors.id,
        cursor,
        limit,
      )
    : emptyPage<Record<string, unknown>>();

  // 5. Schemes
  const schemesPage = (!target || target === "schemes")
    ? await paginateTable(
        db,
        schema.schemes,
        [
          eq(schema.schemes.tenantId, deviceCtx.tenantId),
          or(eq(schema.schemes.storeId, deviceCtx.storeId), sql`${schema.schemes.storeId} IS NULL`),
          lte(schema.schemes.updatedAt, snapshotDate),
          effectiveSince ? gte(schema.schemes.updatedAt, effectiveSince) : undefined,
        ],
        schema.schemes.updatedAt,
        schema.schemes.id,
        cursor,
        limit,
      )
    : emptyPage<Record<string, unknown>>();

  // 6. Store Medicine Settings
  const storeMedSettingsPage = (!target || target === "storeMedicineSettings")
    ? await paginateTable(
        db,
        schema.storeMedicineSettings,
        [
          eq(schema.storeMedicineSettings.tenantId, deviceCtx.tenantId),
          eq(schema.storeMedicineSettings.storeId, deviceCtx.storeId),
          lte(schema.storeMedicineSettings.updatedAt, snapshotDate),
          effectiveSince ? gte(schema.storeMedicineSettings.updatedAt, effectiveSince) : undefined,
        ],
        schema.storeMedicineSettings.updatedAt,
        schema.storeMedicineSettings.medicineId,
        cursor,
        limit,
        schema.storeMedicineSettings.storeId,
      )
    : emptyPage<Record<string, unknown>>();

  // 7. Store configuration metadata
  let storeSettingsPage: SyncEntityPage<Record<string, unknown>> = emptyPage();
  if (!target || target === "storeSettings") {
    const [store] = await db
      .select()
      .from(schema.stores)
      .where(eq(schema.stores.id, deviceCtx.storeId));

    storeSettingsPage = {
      items: store ? [store as unknown as Record<string, unknown>] : [],
      nextCursor: null,
      hasMore: false,
    };
  }

  // Bump device last_sync_at
  await db
    .update(schema.devices)
    .set({ lastSyncAt: new Date() })
    .where(eq(schema.devices.id, deviceCtx.deviceId));

  return {
    sessionId,
    serverTime,
    snapshotTime,
    expiresAt,
    entities: {
      medicines: medicinesPage,
      batches: batchesPage,
      customers: customersPage,
      doctors: doctorsPage,
      schemes: schemesPage,
      storeMedicineSettings: storeMedSettingsPage,
      storeSettings: storeSettingsPage,
    },
  };
}
