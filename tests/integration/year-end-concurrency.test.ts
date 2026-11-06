import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { calculateCutoffDate, generateDraftYearEndSnapshot } from "@/server/domain/accounting-year-end";

describe("Year-End Concurrency & 4 Bidirectional Lock-Race Tests (A5.6)", () => {
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

  async function waitForBlocked(blockingPid: number, blockedPid: number) {
    for (let i = 0; i < 40; i++) {
      const res = await t.pool.query(
        "SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND $2 = ANY(pg_blocking_pids(pid))",
        [blockedPid, blockingPid],
      );
      if (res.rows.length > 0) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`PID ${blockedPid} was not observed blocked by PID ${blockingPid}`);
  }

  it("1. period control SHARE lock causes finalization EXCLUSIVE lock to wait", async () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await t.db.execute(sql`
      SELECT public.issue_year_end_authorization_grant(${tenantId}::uuid, ${storeId}::uuid, '2024-2025', ${adminUserId}::uuid, ${tokenHash}, 60)
    `);

    const client1 = await t.pool.connect();
    const client2 = await t.pool.connect();
    try {
      const p1 = (await client1.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const p2 = (await client2.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;

      await client1.query("BEGIN");
      await client1.query(`
        INSERT INTO stock_movements (tenant_id, store_id, batch_id, medicine_id, type, qty_change, balance_after, unit_cost, effective_at)
        VALUES ('${tenantId}', '${storeId}', '${batchId}', '${medicineId}', 'adjustment', 1, 51, 1500, '2024-05-01 10:00:00+00')
      `);

      let finished = false;
      const finPromise = client2.query(`
        SELECT public.finalize_year_end_snapshot('${tenantId}'::uuid, '${storeId}'::uuid, '2024-2025', '${rawToken}')
      `).then(() => { finished = true; });

      await waitForBlocked(p1, p2);
      expect(finished).toBe(false);

      await client1.query("COMMIT");
      await finPromise;
      expect(finished).toBe(true);
    } finally {
      try { await client1.query("ROLLBACK"); } catch {}
      try { await client2.query("ROLLBACK"); } catch {}
      client1.release(); client2.release();
    }
  });

  it("2. period control EXCLUSIVE lock causes subsequent movement SHARE to wait and reject", async () => {
    await t.db.insert(schema.yearEndPeriodControls).values({
      tenantId, storeId, fiscalYear: "2025-2026", cutoffDate: calculateCutoffDate("2025-2026"), status: "open",
    });
    await t.db.insert(schema.stockMovements).values({
      tenantId, storeId, batchId, medicineId, type: "opening", qtyChange: 10, balanceAfter: 10,
      unitCost: 1500, effectiveAt: new Date("2025-04-05T10:00:00Z"),
    });
    await generateDraftYearEndSnapshot(tenantId, storeId, "2025-2026", t.db);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await t.db.execute(sql`
      SELECT public.issue_year_end_authorization_grant(${tenantId}::uuid, ${storeId}::uuid, '2025-2026', ${adminUserId}::uuid, ${tokenHash}, 60)
    `);

    const client1 = await t.pool.connect();
    const client2 = await t.pool.connect();
    try {
      const p1 = (await client1.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const p2 = (await client2.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;

      await client1.query("BEGIN");
      await client1.query(`
        SELECT id FROM year_end_period_controls
        WHERE tenant_id = '${tenantId}' AND store_id = '${storeId}' AND fiscal_year = '2025-2026' FOR UPDATE
      `);

      let rejected = false;
      const movPromise = client2.query(`
        INSERT INTO stock_movements (tenant_id, store_id, batch_id, medicine_id, type, qty_change, balance_after, unit_cost, effective_at)
        VALUES ('${tenantId}', '${storeId}', '${batchId}', '${medicineId}', 'adjustment', 1, 11, 1500, '2025-05-01 10:00:00+00')
      `).catch((err: Error) => {
        rejected = true;
        expect(err.message).toMatch(/Cannot backdate movement into finalized period/);
      });

      await waitForBlocked(p1, p2);

      await client1.query(`
        SELECT public.finalize_year_end_snapshot('${tenantId}'::uuid, '${storeId}'::uuid, '2025-2026', '${rawToken}')
      `);
      await client1.query("COMMIT");
      await movPromise;
      expect(rejected).toBe(true);
    } finally {
      try { await client1.query("ROLLBACK"); } catch {}
      try { await client2.query("ROLLBACK"); } catch {}
      client1.release(); client2.release();
    }
  });

  it("3. snapshot SHARE lock causes finalization EXCLUSIVE lock to wait", async () => {
    await t.db.insert(schema.yearEndPeriodControls).values({
      tenantId, storeId, fiscalYear: "2026-2027", cutoffDate: calculateCutoffDate("2026-2027"), status: "open",
    });
    await t.db.insert(schema.stockMovements).values({
      tenantId, storeId, batchId, medicineId, type: "opening", qtyChange: 10, balanceAfter: 10,
      unitCost: 1500, effectiveAt: new Date("2026-04-05T10:00:00Z"),
    });
    const draftRes = await generateDraftYearEndSnapshot(tenantId, storeId, "2026-2027", t.db);
    const snapId = draftRes.snapshotId;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await t.db.execute(sql`
      SELECT public.issue_year_end_authorization_grant(${tenantId}::uuid, ${storeId}::uuid, '2026-2027', ${adminUserId}::uuid, ${tokenHash}, 60)
    `);

    const client1 = await t.pool.connect();
    const client2 = await t.pool.connect();
    try {
      const p1 = (await client1.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const p2 = (await client2.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;

      await client1.query("BEGIN");
      await client1.query(`
        UPDATE year_end_stock_items SET override_reason = 'checked'
        WHERE tenant_id = '${tenantId}' AND store_id = '${storeId}' AND snapshot_id = '${snapId}'
      `);

      let finished = false;
      const finPromise = client2.query(`
        SELECT public.finalize_year_end_snapshot('${tenantId}'::uuid, '${storeId}'::uuid, '2026-2027', '${rawToken}')
      `).then(() => { finished = true; });

      await waitForBlocked(p1, p2);
      expect(finished).toBe(false);

      await client1.query("COMMIT");
      await finPromise;
      expect(finished).toBe(true);
    } finally {
      try { await client1.query("ROLLBACK"); } catch {}
      try { await client2.query("ROLLBACK"); } catch {}
      client1.release(); client2.release();
    }
  });

  it("4. snapshot EXCLUSIVE lock causes subsequent item mutation to wait and reject", async () => {
    await t.db.insert(schema.yearEndPeriodControls).values({
      tenantId, storeId, fiscalYear: "2027-2028", cutoffDate: calculateCutoffDate("2027-2028"), status: "open",
    });
    await t.db.insert(schema.stockMovements).values({
      tenantId, storeId, batchId, medicineId, type: "opening", qtyChange: 10, balanceAfter: 10,
      unitCost: 1500, effectiveAt: new Date("2027-04-05T10:00:00Z"),
    });
    const draftRes = await generateDraftYearEndSnapshot(tenantId, storeId, "2027-2028", t.db);
    const snapId = draftRes.snapshotId;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await t.db.execute(sql`
      SELECT public.issue_year_end_authorization_grant(${tenantId}::uuid, ${storeId}::uuid, '2027-2028', ${adminUserId}::uuid, ${tokenHash}, 60)
    `);

    const client1 = await t.pool.connect();
    const client2 = await t.pool.connect();
    try {
      const p1 = (await client1.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
      const p2 = (await client2.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;

      await client1.query("BEGIN");
      await client1.query(`
        SELECT id FROM year_end_stock_snapshots
        WHERE tenant_id = '${tenantId}' AND store_id = '${storeId}' AND id = '${snapId}' FOR UPDATE
      `);

      let rejected = false;
      const mutPromise = client2.query(`
        INSERT INTO year_end_stock_items (tenant_id, store_id, snapshot_id, batch_id, batch_number, expiry_date, qty, landed_cost_paise, cost_value_paise, estimated_nrv_paise, nrv_paise, final_valuation_paise, provision_paise, classification)
        VALUES ('${tenantId}', '${storeId}', '${snapId}', '${batchId}', 'B-LATE', '2027-12-31', 1, 1500, 1500, 1500, 1500, 1500, 0, 'active')
      `).catch((err: Error) => {
        rejected = true;
        expect(err.message).toMatch(/Cannot insert items into finalized\/missing snapshot/);
      });

      await waitForBlocked(p1, p2);

      await client1.query(`
        SELECT public.finalize_year_end_snapshot('${tenantId}'::uuid, '${storeId}'::uuid, '2027-2028', '${rawToken}')
      `);
      await client1.query("COMMIT");
      await mutPromise;
      expect(rejected).toBe(true);
    } finally {
      try { await client1.query("ROLLBACK"); } catch {}
      try { await client2.query("ROLLBACK"); } catch {}
      client1.release(); client2.release();
    }
  });
});
