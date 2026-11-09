import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql, eq, and } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import {
  getSequenceRolloverPreview,
  generateDraftYearEndSnapshot,
  calculateCutoffDate,
  validateHistoricalStockBaseline,
  calculateGl1080Bridge,
  evaluateYearEndReadiness,
} from "@/server/domain/accounting-year-end";

describe("Year-End Rollover & Stock Valuation Integration Tests (A5.6)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let tenantId: string;
  let storeId: string;
  let adminUserId: string;
  let regularUserId: string;
  let medicineId: string;
  let batchId: string;

  beforeAll(async () => {
    t = await createTestDb();

    // 1. Tenant & Store
    const [ten] = await t.db.insert(schema.tenants).values({ name: "Year-End Test Pharmacy", stateCode: "MH" }).returning();
    tenantId = ten.id;
    const [st] = await t.db.insert(schema.stores).values({ tenantId, name: "Main Store", code: "M01", stateCode: "MH" }).returning();
    storeId = st.id;

    // 2. Roles & Users
    const [rOwner] = await t.db.insert(schema.roles).values({ tenantId, key: "owner", name: "Owner", isSystem: true }).returning();
    const [rCashier] = await t.db.insert(schema.roles).values({ tenantId, key: "cashier", name: "Cashier", isSystem: true }).returning();

    const [uAdmin] = await t.db.insert(schema.users).values({ name: "Admin", email: `admin_${Date.now()}@test.com`, passwordHash: "h" }).returning();
    adminUserId = uAdmin.id;
    await t.db.insert(schema.memberships).values({ tenantId, userId: adminUserId, roleId: rOwner.id, status: "active" });

    const [uReg] = await t.db.insert(schema.users).values({ name: "Staff", email: `staff_${Date.now()}@test.com`, passwordHash: "h" }).returning();
    regularUserId = uReg.id;
    await t.db.insert(schema.memberships).values({ tenantId, userId: regularUserId, roleId: rCashier.id, status: "active" });

    // 3. Medicine & Batch
    const [med] = await t.db.insert(schema.medicines).values({ tenantId, name: "Amoxicillin 500mg" }).returning();
    medicineId = med.id;
    const [b] = await t.db.insert(schema.batches).values({
      tenantId, storeId, medicineId, batchNo: "B-2024-01", expiryDate: "2026-12-31",
      purchaseRate: 5000, saleRate: 7500, mrp: 8000, qtyOnHand: 100, status: "active",
    }).returning();
    batchId = b.id;

    // 4. Initialize open Period Control for FY 2024-2025
    await t.db.insert(schema.yearEndPeriodControls).values({
      tenantId, storeId, fiscalYear: "2024-2025", cutoffDate: calculateCutoffDate("2024-2025"), status: "open",
    });

    // 5. Initial Stock Movement prior to 2024-2025 cutoff
    await t.db.insert(schema.stockMovements).values({
      tenantId, storeId, batchId, medicineId, type: "opening", qtyChange: 100, balanceAfter: 100,
      unitCost: 5000, effectiveAt: new Date("2024-04-01T10:00:00Z"),
    });
  });

  afterAll(async () => { await t?.cleanup(); });

  it("1. read-only sequence rollover simulates 1 April counter reset without burning numbers", async () => {
    const preview = await getSequenceRolloverPreview(tenantId, storeId, "2024-2025", t.db);
    expect(preview.currentFiscalYear).toBe("2024-2025");
    expect(preview.nextFiscalYear).toBe("2025-2026");
    const saleDoc = preview.docTypes.find((d) => d.docType === "sale");
    expect(saleDoc).toBeDefined();
    expect(saleDoc?.isValidGstRule46b).toBe(true);
    expect(saleDoc?.simulatedFirstDocNumber).toMatch(/^.*\/25-26\/000001$/);
    expect(saleDoc?.simulatedFirstDocNumber.length).toBeLessThanOrEqual(16);
  });

  it("2. stock baseline provenance preflight validates inception and catches negative balances", async () => {
    const cutoff = calculateCutoffDate("2024-2025");
    const validCheck = await validateHistoricalStockBaseline(tenantId, storeId, cutoff, t.db);
    expect(validCheck.valid).toBe(true);

    const [badStore] = await t.db.insert(schema.stores).values({
      tenantId, name: "Anomalous Store", code: "ANO", stateCode: "MH",
    }).returning();
    await t.db.insert(schema.yearEndPeriodControls).values({
      tenantId, storeId: badStore.id, fiscalYear: "2024-2025", cutoffDate: cutoff, status: "open",
    });
    const [badB] = await t.db.insert(schema.batches).values({
      tenantId, storeId: badStore.id, medicineId, batchNo: "B-ANOMALOUS", expiryDate: "2026-12-31",
      purchaseRate: 2000, saleRate: 3000, mrp: 4000, qtyOnHand: 0, status: "active",
    }).returning();
    await t.db.insert(schema.stockMovements).values({
      tenantId, storeId: badStore.id, batchId: badB.id, medicineId, type: "adjustment", qtyChange: -50, balanceAfter: -50,
      unitCost: 2000, effectiveAt: new Date("2024-05-01T10:00:00Z"),
    });

    const invalidCheck = await validateHistoricalStockBaseline(tenantId, badStore.id, cutoff, t.db);
    expect(invalidCheck.valid).toBe(false);
    expect(invalidCheck.anomalousBatches.some((b) => b.batchId === badB.id)).toBe(true);
  });

  it("3 & 4. draft snapshot generation, CA override and token finalization", async () => {
    const draftRes = await generateDraftYearEndSnapshot(tenantId, storeId, "2024-2025", t.db);
    const snapId = draftRes.snapshotId;
    expect(snapId).toBeDefined();

    const [snap] = await t.db.select().from(schema.yearEndStockSnapshots).where(eq(schema.yearEndStockSnapshots.id, snapId));
    expect(snap.status).toBe("draft");
    expect(snap.totalUnits).toBe(100);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await t.db.execute(sql`
      SELECT public.issue_year_end_authorization_grant(${tenantId}::uuid, ${storeId}::uuid, '2024-2025', ${adminUserId}::uuid, ${tokenHash}, 60)
    `);

    const finRes = await t.db.execute(sql`
      SELECT public.finalize_year_end_snapshot(${tenantId}::uuid, ${storeId}::uuid, '2024-2025', ${rawToken}) AS snap_id
    `);
    expect(finRes.rows[0]?.snap_id).toBe(snapId);

    const [finalizedSnap] = await t.db.select().from(schema.yearEndStockSnapshots).where(eq(schema.yearEndStockSnapshots.id, snapId));
    expect(finalizedSnap.status).toBe("finalized");
    expect(finalizedSnap.approvedBy).toBe(adminUserId);
  });

  async function expectDbError(promise: Promise<unknown>, pattern?: RegExp) {
    try {
      await promise;
      expect.unreachable("Expected database query to throw");
    } catch (err: unknown) {
      if (pattern && err instanceof Error) {
        const fullMsg = `${err.message} ${(err as { cause?: Error }).cause?.message ?? ""}`;
        expect(fullMsg).toMatch(pattern);
      }
    }
  }

  it("5. rejects backdated movements post-finalization via serialization trigger", async () => {
    await expectDbError(
      t.db.insert(schema.stockMovements).values({
        tenantId, storeId, batchId, medicineId, type: "adjustment", qtyChange: 5, balanceAfter: 105,
        unitCost: 5000, effectiveAt: new Date("2024-05-01T10:00:00Z"),
      }),
      /Cannot backdate movement into finalized period/,
    );
  });

  it("6. direct SQL lifecycle update to finalized is prohibited", async () => {
    await expectDbError(
      t.db.execute(sql`
        UPDATE public.year_end_stock_snapshots SET status = 'finalized' WHERE tenant_id = ${tenantId}::uuid AND store_id = ${storeId}::uuid
      `),
    );
  });

  it("7. item mutation on finalized snapshot is blocked by fn_protect_year_end_items", async () => {
    const [finalizedSnap] = await t.db.select().from(schema.yearEndStockSnapshots)
      .where(and(eq(schema.yearEndStockSnapshots.tenantId, tenantId), eq(schema.yearEndStockSnapshots.fiscalYear, "2024-2025")));

    await expectDbError(
      t.db.insert(schema.yearEndStockItems).values({
        tenantId, storeId, snapshotId: finalizedSnap.id, batchId, batchNumber: "B-2024-01",
        expiryDate: "2026-12-31", qty: 10, landedCostPaise: 5000, costValuePaise: 50000,
        estimatedNrvPaise: 5000, nrvPaise: 5000, finalValuationPaise: 50000, provisionPaise: 0,
        classification: "active", nrvBasis: "sales_history_90d", nrvSource: "sales_ledger",
      }),
      /Cannot insert items into finalized\/missing snapshot/,
    );
  });

  it("8. token grant authorization boundary rejects unprivileged user and consumed token", async () => {
    await t.db.insert(schema.yearEndPeriodControls).values({
      tenantId, storeId, fiscalYear: "2025-2026", cutoffDate: calculateCutoffDate("2025-2026"), status: "open",
    });
    const token = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    await expectDbError(
      t.db.execute(sql`
        SELECT public.issue_year_end_authorization_grant(${tenantId}::uuid, ${storeId}::uuid, '2025-2026', ${regularUserId}::uuid, ${hash}, 60)
      `),
      /is not active owner\/admin/,
    );

    await expectDbError(
      t.db.execute(sql`
        SELECT public.finalize_year_end_snapshot(${tenantId}::uuid, ${storeId}::uuid, '2024-2025', 'invalid_token_deadbeef')
      `),
      /Invalid, expired, or consumed authorization grant/,
    );
  });

  it("9. cutoff date and fiscal year invariant enforced by database trigger/check", async () => {
    await expect(
      t.db.insert(schema.yearEndPeriodControls).values({
        tenantId, storeId, fiscalYear: "2025-2026",
        cutoffDate: new Date("2027-03-31T23:59:59.999+05:30"),
        status: "open",
      }),
    ).rejects.toThrow();
  });

  it("10. aggregate overflow check rejects header sums exceeding 10^15 paise", async () => {
    await expect(
      t.db.insert(schema.yearEndStockSnapshots).values({
        tenantId, storeId, fiscalYear: "2029-2030",
        cutoffDate: new Date("2030-03-31T23:59:59.999+05:30"),
        status: "draft", totalUnits: 10, grossLandedCostPaise: 1000,
        totalNrvPaise: 1000, finalValuationPaise: 1000,
        totalProvisionPaise: 1000000000000001,
      }),
    ).rejects.toThrow();
  });

  it("11. A5.5 continuity rejects duplicate consumption and links finalized source", async () => {
    const [finalizedSnap] = await t.db.select().from(schema.yearEndStockSnapshots)
      .where(and(eq(schema.yearEndStockSnapshots.tenantId, tenantId), eq(schema.yearEndStockSnapshots.fiscalYear, "2024-2025")));

    const [openSnap] = await t.db.insert(schema.openingInventorySnapshots).values({
      tenantId, storeId, asOfDate: "2025-04-01", totalValuePaise: finalizedSnap.finalValuationPaise,
      sourceYearEndSnapshotId: finalizedSnap.id, status: "posted",
    }).returning();
    expect(openSnap.sourceYearEndSnapshotId).toBe(finalizedSnap.id);

    await expectDbError(
      t.db.insert(schema.openingInventorySnapshots).values({
        tenantId, storeId, asOfDate: "2025-04-02", totalValuePaise: finalizedSnap.finalValuationPaise,
        sourceYearEndSnapshotId: finalizedSnap.id, status: "posted",
      }),
      /opening_inv_source_year_end_uq/,
    );
  });

  it("12. GL 1080 signed reconciliation bridge and readiness evaluation", async () => {
    const bridge = await calculateGl1080Bridge(tenantId, storeId, "2024-2025", t.db);
    expect(bridge).toBeDefined();
    expect(bridge.closingPhysicalStockPaise).toBeGreaterThan(0);
    expect(typeof bridge.residualDiscrepancyPaise).toBe("number");

    const readiness = await evaluateYearEndReadiness(tenantId, storeId, "2024-2025", t.db);
    expect(readiness.fiscalYear).toBe("2024-2025");
    expect(readiness.checks.length).toBeGreaterThan(5);
    expect(readiness.checks.some((c) => c.id === "trial_balance")).toBe(true);
    expect(readiness.checks.some((c) => c.id === "period_locks")).toBe(true);
  });
});
