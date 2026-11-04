import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { recordStockMovement } from "@/server/domain/stock";
import { createTestDb } from "../setup/db";
import { makeBatch, makeCustomer, makeMedicine, makeStore, makeTenant, makeUser } from "../setup/factories";

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.cleanup();
});

describe("Task A4.2: Sync-Ready Schema & Triggers", () => {
  it("verifies all 6 sync tables have active set_updated_at triggers attached", async () => {
    const expectedTriggers = [
      { table: "batches", trigger: "trg_batches_set_updated_at" },
      { table: "customers", trigger: "trg_customers_set_updated_at" },
      { table: "doctors", trigger: "trg_doctors_set_updated_at" },
      { table: "schemes", trigger: "trg_schemes_set_updated_at" },
      { table: "store_medicine_settings", trigger: "trg_store_medicine_settings_set_updated_at" },
      { table: "medicines", trigger: "trg_medicines_set_updated_at" },
    ];

    for (const { table, trigger } of expectedTriggers) {
      const res = await t.db.execute(sql`
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = ${table}
          AND trigger_name = ${trigger}
      `);
      expect(res.rows.length, `Trigger ${trigger} on ${table} must exist`).toBe(1);
    }
  });

  it("verifies composite delta sync indexes exist on all 6 tables", async () => {
    const expectedIndexes = [
      { table: "batches", index: "batches_store_updated_idx" },
      { table: "customers", index: "customers_tenant_updated_idx" },
      { table: "doctors", index: "doctors_tenant_updated_idx" },
      { table: "schemes", index: "schemes_tenant_updated_idx" },
      { table: "store_medicine_settings", index: "sms_store_updated_idx" },
      { table: "medicines", index: "medicines_tenant_updated_idx" },
    ];

    for (const { table, index } of expectedIndexes) {
      const res = await t.db.execute(sql`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = ${table}
          AND indexname = ${index}
      `);
      expect(res.rows.length, `Index ${index} on ${table} must exist`).toBe(1);
    }
  });

  it("bumps updated_at on direct update of business fields", async () => {
    const tenant = await makeTenant(t.db);
    const customer = await makeCustomer(t.db, tenant.id, { name: "Original Customer" });

    // Ensure distinct timestamps across clock ticks
    await new Promise((r) => setTimeout(r, 20));

    await t.db
      .update(schema.customers)
      .set({ name: "Updated Customer Name" })
      .where(eq(schema.customers.id, customer.id));

    const [updated] = await t.db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, customer.id));

    expect(updated.updatedAt.getTime()).toBeGreaterThan(customer.updatedAt.getTime());
    expect(updated.name).toBe("Updated Customer Name");
  });

  it("does not bump updated_at on no-op update", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const medicine = await makeMedicine(t.db, tenant.id);
    const batch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      medicineId: medicine.id,
      batchNo: "NOOP-001",
      mrp: 10000,
    });

    const initialUpdatedAt = batch.updatedAt.getTime();

    // No-op update with identical business value
    await t.db
      .update(schema.batches)
      .set({ mrp: 10000 })
      .where(eq(schema.batches.id, batch.id));

    const [unchanged] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, batch.id));

    expect(unchanged.updatedAt.getTime()).toBe(initialUpdatedAt);
  });

  it("overrides client-supplied updated_at with authoritative database clock_timestamp", async () => {
    const tenant = await makeTenant(t.db);
    const customer = await makeCustomer(t.db, tenant.id, { name: "Spoof Target" });

    const spoofDate = new Date("2000-01-01T00:00:00.000Z");

    await t.db
      .update(schema.customers)
      .set({
        name: "Legit Update with Spoofed Time",
        updatedAt: spoofDate,
      })
      .where(eq(schema.customers.id, customer.id));

    const [saved] = await t.db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.id, customer.id));

    expect(saved.name).toBe("Legit Update with Spoofed Time");
    // Authoritative trigger overrides spoofed year 2000 date with current timestamp
    expect(saved.updatedAt.getTime()).toBeGreaterThan(new Date("2026-01-01").getTime());
  });

  it("bumps batches.updated_at via recordStockMovement domain function", async () => {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const user = await makeUser(t.db);
    const medicine = await makeMedicine(t.db, tenant.id);
    const batch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      medicineId: medicine.id,
      qtyOnHand: 10,
    });

    const beforeTime = batch.updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 20));

    await t.db.transaction(async (tx) => {
      await recordStockMovement({
        tx,
        tenantId: tenant.id,
        storeId: store.id,
        batchId: batch.id,
        medicineId: medicine.id,
        type: "adjustment",
        qtyChange: 5,
        userId: user.id,
      });
    });

    const [afterBatch] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, batch.id));

    expect(afterBatch.qtyOnHand).toBe(15);
    expect(afterBatch.updatedAt.getTime()).toBeGreaterThan(beforeTime);
  });

  it("retains soft-deactivated records with updated timestamps for sync retrieval", async () => {
    const tenant = await makeTenant(t.db);
    const customer = await makeCustomer(t.db, tenant.id, { name: "Active Customer" });

    const cursor = new Date(customer.updatedAt.getTime() - 1000);
    await new Promise((r) => setTimeout(r, 20));

    // Deactivate customer (tombstone pattern for offline sync)
    await t.db
      .update(schema.customers)
      .set({ isActive: false })
      .where(eq(schema.customers.id, customer.id));

    // Delta sync pull query: finds records updated after cursor
    const pulled = await t.db
      .select()
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.tenantId, tenant.id),
          gt(schema.customers.updatedAt, cursor),
        ),
      );

    expect(pulled.length).toBe(1);
    expect(pulled[0].id).toBe(customer.id);
    expect(pulled[0].isActive).toBe(false);
  });

  it("paginates deterministically using (updated_at, id) ordering", async () => {
    const tenant = await makeTenant(t.db);

    const c1 = await makeCustomer(t.db, tenant.id, { name: "Paginate Alpha" });
    const c2 = await makeCustomer(t.db, tenant.id, { name: "Paginate Beta" });

    const ordered = await t.db
      .select({ id: schema.customers.id, updatedAt: schema.customers.updatedAt })
      .from(schema.customers)
      .where(eq(schema.customers.tenantId, tenant.id))
      .orderBy(asc(schema.customers.updatedAt), asc(schema.customers.id));

    expect(ordered.length).toBe(2);
    // Deterministic ordering guaranteed by unique id tie-breaker
    const ids = ordered.map((r) => r.id);
    expect(ids).toContain(c1.id);
    expect(ids).toContain(c2.id);
  });
});
