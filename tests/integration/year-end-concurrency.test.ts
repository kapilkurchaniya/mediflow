import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { calculateCutoffDate, generateDraftYearEndSnapshot } from "@/server/domain/accounting-year-end";

describe("Year-End Rollover Concurrency & Multi-Connection Locks (A5.6)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let storeId: string;
  let adminUserId: string;
  let medicineId: string;
  let batchId: string;

  beforeAll(async () => {
    t = await createTestDb();

    const [ten] = await t.db.insert(schema.tenants).values({ name: "Concurrency Pharmacy", stateCode: "DL" }).returning();
    tenantId = ten.id;
    const [st] = await t.db.insert(schema.stores).values({ tenantId, name: "Connaught Place", code: "CP1", stateCode: "DL" }).returning();
    storeId = st.id;

    const [rOwner] = await t.db.insert(schema.roles).values({ tenantId, key: "owner", name: "Owner", isSystem: true }).returning();
    const [uAdmin] = await t.db.insert(schema.users).values({ name: "Owner Admin", email: `owner_${Date.now()}@test.com`, passwordHash: "h" }).returning();
    adminUserId = uAdmin.id;
    await t.db.insert(schema.memberships).values({ tenantId, userId: adminUserId, roleId: rOwner.id, status: "active" });

    const [med] = await t.db.insert(schema.medicines).values({ tenantId, name: "Paracetamol 650mg" }).returning();
    medicineId = med.id;
    const [b] = await t.db.insert(schema.batches).values({
      tenantId, storeId, medicineId, batchNo: "B-CONCUR-01", expiryDate: "2026-12-31",
      purchaseRate: 1500, saleRate: 3000, mrp: 3500, qtyOnHand: 50, status: "active",
    }).returning();
    batchId = b.id;

    await t.db.insert(schema.yearEndPeriodControls).values({
      tenantId, storeId, fiscalYear: "2024-2025", cutoffDate: calculateCutoffDate("2024-2025"), status: "open",
    });

    await t.db.insert(schema.stockMovements).values({
      tenantId, storeId, batchId, medicineId, type: "opening", qtyChange: 50, balanceAfter: 50,
      unitCost: 1500, effectiveAt: new Date("2024-04-10T10:00:00Z"),
    });

    await generateDraftYearEndSnapshot(tenantId, storeId, "2024-2025", t.db);
  });

  afterAll(async () => { await t?.cleanup(); });

  it("1. period control FOR SHARE lock blocks concurrent finalization FOR UPDATE until commit", async () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await t.db.execute(sql`
      SELECT public.issue_year_end_authorization_grant(${tenantId}::uuid, ${storeId}::uuid, '2024-2025', ${adminUserId}::uuid, ${tokenHash}, 60)
    `);

    const client1 = await t.pool.connect();
    const client2 = await t.pool.connect();

    try {
      await client1.query("BEGIN");
      // Connection 1 inserts a movement, which acquires FOR SHARE lock on period control
      await client1.query(`
        INSERT INTO stock_movements (tenant_id, store_id, batch_id, medicine_id, type, qty_change, balance_after, unit_cost, effective_at)
        VALUES ('${tenantId}', '${storeId}', '${batchId}', '${medicineId}', 'adjustment', 1, 51, 1500, '2024-05-01 10:00:00+00')
      `);

      let client2Finished = false;
      const client2Promise = client2.query(`
        SELECT public.finalize_year_end_snapshot('${tenantId}'::uuid, '${storeId}'::uuid, '2024-2025', '${rawToken}')
      `).then(() => { client2Finished = true; });

      // Give client2 50ms to attempt to run; it must be blocked by client1's SHARE lock
      await new Promise((r) => setTimeout(r, 50));
      expect(client2Finished).toBe(false);

      // Client 1 commits transaction, releasing lock
      await client1.query("COMMIT");

      // Now client2 finishes successfully
      await client2Promise;
      expect(client2Finished).toBe(true);
    } finally {
      client1.release();
      client2.release();
    }
  });

  it("2. subsequent movement insertion after finalization is rejected by serialization trigger", async () => {
    const client = await t.pool.connect();
    try {
      let rejected = false;
      try {
        await client.query(`
          INSERT INTO stock_movements (tenant_id, store_id, batch_id, medicine_id, type, qty_change, balance_after, unit_cost, effective_at)
          VALUES ('${tenantId}', '${storeId}', '${batchId}', '${medicineId}', 'adjustment', 2, 53, 1500, '2024-06-01 10:00:00+00')
        `);
      } catch (err: unknown) {
        rejected = true;
        expect((err as Error).message).toMatch(/Cannot backdate movement into finalized period/);
      }
      expect(rejected).toBe(true);
    } finally {
      client.release();
    }
  });
});
