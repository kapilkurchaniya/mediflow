import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { calculateCutoffDate, generateDraftYearEndSnapshot } from "@/server/domain/accounting-year-end";
import { captureOpeningInventorySnapshot } from "@/server/domain/accounting-opening-balances/inventory-snapshot";

describe("Year-End A5.5 Continuity & Source Ingestion Tests (A5.6)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let storeId: string;
  let adminUserId: string;
  let medicineId: string;
  let batchId: string;
  let finalizedSnapshotId: string;
  let finalizedValuationPaise: number;

  beforeAll(async () => {
    t = await createTestDb();

    const [ten] = await t.db.insert(schema.tenants).values({ name: "Continuity Pharmacy", stateCode: "KA" }).returning();
    tenantId = ten.id;
    const [st] = await t.db.insert(schema.stores).values({ tenantId, name: "Indiranagar", code: "IN1", stateCode: "KA" }).returning();
    storeId = st.id;

    const [rOwner] = await t.db.insert(schema.roles).values({ tenantId, key: "owner", name: "Owner", isSystem: true }).returning();
    const [uAdmin] = await t.db.insert(schema.users).values({ name: "Owner Admin", email: `cont_${Date.now()}@test.com`, passwordHash: "h" }).returning();
    adminUserId = uAdmin.id;
    await t.db.insert(schema.memberships).values({ tenantId, userId: adminUserId, roleId: rOwner.id, status: "active" });

    const [med] = await t.db.insert(schema.medicines).values({ tenantId, name: "Cetirizine 10mg" }).returning();
    medicineId = med.id;
    const [b] = await t.db.insert(schema.batches).values({
      tenantId, storeId, medicineId, batchNo: "B-CONT-01", expiryDate: "2026-12-31",
      purchaseRate: 2000, saleRate: 4000, mrp: 5000, qtyOnHand: 100, status: "active",
    }).returning();
    batchId = b.id;

    await t.db.insert(schema.yearEndPeriodControls).values({
      tenantId, storeId, fiscalYear: "2024-2025", cutoffDate: calculateCutoffDate("2024-2025"), status: "open",
    });

    await t.db.insert(schema.stockMovements).values({
      tenantId, storeId, batchId, medicineId, type: "opening", qtyChange: 100, balanceAfter: 100,
      unitCost: 2000, effectiveAt: new Date("2024-04-10T10:00:00Z"),
    });

    const draftRes = await generateDraftYearEndSnapshot(tenantId, storeId, "2024-2025", t.db);
    finalizedSnapshotId = draftRes.snapshotId;
    finalizedValuationPaise = draftRes.finalValuationPaise;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await t.db.execute(sql`
      SELECT public.issue_year_end_authorization_grant(${tenantId}::uuid, ${storeId}::uuid, '2024-2025', ${adminUserId}::uuid, ${tokenHash}, 60)
    `);
    await t.db.execute(sql`
      SELECT public.finalize_year_end_snapshot(${tenantId}::uuid, ${storeId}::uuid, '2024-2025', ${rawToken})
    `);
  });

  afterAll(async () => { await t?.cleanup(); });

  it("1. rejects ingestion when source snapshot is not finalized", async () => {
    await t.db.insert(schema.yearEndPeriodControls).values({
      tenantId, storeId, fiscalYear: "2025-2026", cutoffDate: calculateCutoffDate("2025-2026"), status: "open",
    });
    const draftRes = await generateDraftYearEndSnapshot(tenantId, storeId, "2025-2026", t.db);

    await expect(
      captureOpeningInventorySnapshot(t.db, {
        tenantId, storeId, asOfDate: "2026-04-01", userId: adminUserId,
        sourceYearEndSnapshotId: draftRes.snapshotId,
      }),
    ).rejects.toThrow(/must be finalized/);
  });

  it("2. rejects ingestion when source fiscal year is not adjacent", async () => {
    await expect(
      captureOpeningInventorySnapshot(t.db, {
        tenantId, storeId, asOfDate: "2026-04-01", userId: adminUserId,
        sourceYearEndSnapshotId: finalizedSnapshotId, // 2024-2025 is not adjacent to 2026-04-01 (expected 2025-2026)
      }),
    ).rejects.toThrow(/is not adjacent to opening date/);
  });

  it("3. rejects ingestion when opening movements do not match source valuation", async () => {
    // Insert an extra opening movement so total opening value (202,000 paise) mismatches finalized source (200,000 paise)
    await t.db.insert(schema.stockMovements).values({
      tenantId, storeId, batchId, medicineId, type: "opening", qtyChange: 1, balanceAfter: 101,
      unitCost: 2000, effectiveAt: new Date("2025-04-01T09:00:00Z"),
    });

    await expect(
      captureOpeningInventorySnapshot(t.db, {
        tenantId, storeId, asOfDate: "2025-04-01", userId: adminUserId,
        sourceYearEndSnapshotId: finalizedSnapshotId,
      }),
    ).rejects.toThrow(/does not match source snapshot valuation/);
  });

  it("4. successfully links finalized source with adjacent FY and exact valuation match", async () => {
    // Create dedicated store to test exact matching ingestion
    const [matchStore] = await t.db.insert(schema.stores).values({ tenantId, name: "Exact Match Store", code: "EMS", stateCode: "KA" }).returning();
    const [matchB] = await t.db.insert(schema.batches).values({
      tenantId, storeId: matchStore.id, medicineId, batchNo: "B-MATCH", expiryDate: "2026-12-31",
      purchaseRate: 1000, saleRate: 2000, mrp: 2500, qtyOnHand: 50, status: "active",
    }).returning();

    await t.db.insert(schema.yearEndPeriodControls).values({
      tenantId, storeId: matchStore.id, fiscalYear: "2024-2025", cutoffDate: calculateCutoffDate("2024-2025"), status: "open",
    });
    await t.db.insert(schema.stockMovements).values({
      tenantId, storeId: matchStore.id, batchId: matchB.id, medicineId, type: "purchase", qtyChange: 50, balanceAfter: 50,
      unitCost: 1000, effectiveAt: new Date("2024-04-05T10:00:00Z"),
    });

    const matchDraft = await generateDraftYearEndSnapshot(tenantId, matchStore.id, "2024-2025", t.db);
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    await t.db.execute(sql`
      SELECT public.issue_year_end_authorization_grant(${tenantId}::uuid, ${matchStore.id}::uuid, '2024-2025', ${adminUserId}::uuid, ${tokenHash}, 60)
    `);
    await t.db.execute(sql`
      SELECT public.finalize_year_end_snapshot(${tenantId}::uuid, ${matchStore.id}::uuid, '2024-2025', ${rawToken})
    `);

    // Open period control for 2025-2026 to allow 2025-04-01 opening movements
    await t.db.insert(schema.yearEndPeriodControls).values({
      tenantId, storeId: matchStore.id, fiscalYear: "2025-2026", cutoffDate: calculateCutoffDate("2025-2026"), status: "open",
    });

    // Ingest opening snapshot for matchStore with matching movement on 2025-04-01
    await t.db.insert(schema.stockMovements).values({
      tenantId, storeId: matchStore.id, batchId: matchB.id, medicineId, type: "opening", qtyChange: 50, balanceAfter: 50,
      unitCost: 1000, effectiveAt: new Date("2025-04-01T10:00:00Z"),
    });

    const snap = await captureOpeningInventorySnapshot(t.db, {
      tenantId, storeId: matchStore.id, asOfDate: "2025-04-01", userId: adminUserId,
      sourceYearEndSnapshotId: matchDraft.snapshotId,
    });

    expect(snap.snapshotId).toBeDefined();
    expect(snap.totalValuePaise).toBe(matchDraft.finalValuationPaise);

    const [row] = await t.db.select().from(schema.openingInventorySnapshots)
      .where(sql`id = ${snap.snapshotId}::uuid`);
    expect(row.sourceYearEndSnapshotId).toBe(matchDraft.snapshotId);
  });

  it("5. duplicate consumption is rejected by opening_inv_source_year_end_uq constraint", async () => {
    // 1st consumption succeeds
    await t.db.insert(schema.openingInventorySnapshots).values({
      tenantId, storeId, asOfDate: "2025-04-01", totalValuePaise: finalizedValuationPaise,
      sourceYearEndSnapshotId: finalizedSnapshotId, status: "captured",
    });

    // 2nd consumption of same source snapshot in same tenant/store is rejected
    await expect(
      t.db.insert(schema.openingInventorySnapshots).values({
        tenantId, storeId, asOfDate: "2025-04-02", totalValuePaise: finalizedValuationPaise,
        sourceYearEndSnapshotId: finalizedSnapshotId, status: "captured",
      }),
    ).rejects.toThrow();
  });
});
