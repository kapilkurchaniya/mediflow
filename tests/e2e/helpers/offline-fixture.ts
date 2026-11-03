import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import * as schema from "../../../src/server/db/schema";
import { generateDeviceToken, hashDeviceToken } from "../../../src/server/domain/devices/types";
import { reserveDeviceInvoiceNumbers } from "../../../src/server/domain/sync/numbers";
import { recordStockMovement } from "../../../src/server/domain/stock";
import type { DeviceAuthCtx } from "../../../src/server/domain/devices/types";
import type { ReserveNumbersResponse } from "../../../src/server/domain/sync/types";

const testDbUrl =
  process.env.DATABASE_URL ||
  "postgres://mediflow:mediflow@localhost:5433/mediflow_test";

export const testPool = new Pool({ connectionString: testDbUrl });
export const testDb = drizzle(testPool, { schema });

export type Tenant = typeof schema.tenants.$inferSelect;
export type Store = typeof schema.stores.$inferSelect;
export type User = typeof schema.users.$inferSelect;
export type Device = typeof schema.devices.$inferSelect;
export type Medicine = typeof schema.medicines.$inferSelect;
export type Batch = typeof schema.batches.$inferSelect;

export interface TestDeviceSetup {
  tenant: Tenant;
  store: Store;
  adminUser: User;
  device: Device;
  rawToken: string;
  reservation: ReserveNumbersResponse;
}

/**
 * Authoritatively provisions an active terminal device and invoice reservation on PostgreSQL.
 */
export async function setupTestDevice(options: {
  deviceCode?: string;
  deviceName?: string;
  reservationCount?: number;
} = {}): Promise<TestDeviceSetup> {
  const code = options.deviceCode || "01";
  const name = options.deviceName || `E2E Counter ${code}`;
  const count = options.reservationCount || 100;

  // 1. Fetch seeded tenant and store
  const [store] = await testDb
    .select()
    .from(schema.stores)
    .where(eq(schema.stores.code, "APL001"))
    .limit(1);

  if (!store) {
    throw new Error("[offline-fixture] Seeded store APL001 not found. Ensure seed-e2e ran.");
  }

  const [tenant] = await testDb
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, store.tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error(`[offline-fixture] Tenant ${store.tenantId} not found.`);
  }

  const [adminUser] = await testDb
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, "admin@apollo.com"))
    .limit(1);

  if (!adminUser) {
    throw new Error("[offline-fixture] Seeded admin user admin@apollo.com not found.");
  }

  // 2. Generate pairing credentials
  const rawToken = generateDeviceToken();
  const tokenHash = hashDeviceToken(rawToken);

  // 3. Upsert device record
  const [existingDevice] = await testDb
    .select()
    .from(schema.devices)
    .where(and(eq(schema.devices.storeId, store.id), eq(schema.devices.code, code)))
    .limit(1);

  let device: Device;
  if (existingDevice) {
    const [updated] = await testDb
      .update(schema.devices)
      .set({ tokenHash, revokedAt: null, lastSeenAt: new Date() })
      .where(eq(schema.devices.id, existingDevice.id))
      .returning();
    device = updated;
  } else {
    const [inserted] = await testDb
      .insert(schema.devices)
      .values({
        tenantId: tenant.id,
        storeId: store.id,
        code,
        name,
        platform: "browser",
        tokenHash,
        createdBy: adminUser.id,
      })
      .returning();
    device = inserted;
  }

  // 4. Reserve initial sequence block via authoritative domain service
  const deviceCtx: DeviceAuthCtx = {
    tenantId: tenant.id,
    storeId: store.id,
    deviceId: device.id,
    code: device.code,
    name: device.name,
    platform: "browser",
  };

  const reservation = await reserveDeviceInvoiceNumbers(testDb, deviceCtx, {
    clientReservationId: `e2e-res-${code}-${Date.now()}`,
    count,
  });

  return { tenant, store, adminUser, device, rawToken, reservation };
}

/**
 * Creates an isolated batch dedicated to deterministic multi-device stock conflict verification.
 */
export async function setupConflictBatch(params: {
  tenantId: string;
  storeId: string;
  userId: string;
  initialQty?: number;
}): Promise<{ medicine: Medicine; batch: Batch }> {
  const initialQty = params.initialQty ?? 10;

  // Find Paracetamol 500mg
  const [med] = await testDb
    .select()
    .from(schema.medicines)
    .where(
      and(
        eq(schema.medicines.tenantId, params.tenantId),
        eq(schema.medicines.name, "Paracetamol 500mg"),
      ),
    )
    .limit(1);

  if (!med) throw new Error("Paracetamol 500mg not found.");

  const [existingBatch] = await testDb
    .select()
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.storeId, params.storeId),
        eq(schema.batches.batchNo, "B-CONFLICT-001"),
      ),
    )
    .limit(1);

  let batch: Batch;
  const expiryNextYear = new Date();
  expiryNextYear.setFullYear(expiryNextYear.getFullYear() + 1);
  const expiryDate = expiryNextYear.toISOString().split("T")[0];

  if (existingBatch) {
    const [updated] = await testDb
      .update(schema.batches)
      .set({ qtyOnHand: initialQty, status: "active" })
      .where(eq(schema.batches.id, existingBatch.id))
      .returning();
    batch = updated;
  } else {
    const [created] = await testDb
      .insert(schema.batches)
      .values({
        tenantId: params.tenantId,
        storeId: params.storeId,
        medicineId: med.id,
        batchNo: "B-CONFLICT-001",
        expiryDate,
        purchaseRate: 1050,
        mrp: 1500,
        saleRate: 1500,
        qtyOnHand: initialQty,
        status: "active",
      })
      .returning();
    batch = created;
  }

  // Record opening balance movement inside a transaction
  await testDb.transaction(async (tx) => {
    await recordStockMovement({
      tx,
      tenantId: params.tenantId,
      storeId: params.storeId,
      batchId: batch.id,
      medicineId: med.id,
      type: "opening",
      qtyChange: initialQty,
      unitCost: 1050,
      note: "Conflict test opening stock",
      userId: params.userId,
    });
  });

  return { medicine: med, batch };
}

/**
 * Depletes a batch to 0 using an audited domain movement prior to offline sync reconnection.
 */
export async function depleteBatchStock(params: {
  tenantId: string;
  storeId: string;
  batchId: string;
  medicineId: string;
  userId: string;
}): Promise<void> {
  const [current] = await testDb
    .select({ qty: schema.batches.qtyOnHand })
    .from(schema.batches)
    .where(eq(schema.batches.id, params.batchId));

  const currentQty = current?.qty ?? 0;
  if (currentQty <= 0) return;

  await testDb.transaction(async (tx) => {
    await recordStockMovement({
      tx,
      tenantId: params.tenantId,
      storeId: params.storeId,
      batchId: params.batchId,
      medicineId: params.medicineId,
      type: "adjustment",
      qtyChange: -currentQty,
      unitCost: 1050,
      note: "Audited depletion before concurrent offline sync",
      userId: params.userId,
    });
  });
}

export async function closeDbPool(): Promise<void> {
  await testPool.end();
}
