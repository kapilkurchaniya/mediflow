import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { AccountingInvariantsOracle } from "./accounting-invariants-oracle";
import { captureOpeningInventorySnapshot, postInventorySnapshotJournal } from "@/server/domain/accounting-opening-balances";
import { getOrSeedAccounts } from "@/server/domain/accounting";
import { getCurrentIndianFY } from "@/server/domain/accounting-periods";
import { calculateCutoffDate } from "@/server/domain/accounting-year-end/closing-stock-valuation";

describe("Accounting Invariants & Database Double-Entry Hardening (A5.5)", () => {
  let t: Awaited<ReturnType<typeof createTestDb>>;
  let tenantA: string;
  let tenantB: string;
  let storeA: string;
  let storeB: string;
  let medicineId: string;
  let batchA: string;
  let movA: number;
  let accounts: Record<string, string>;
  let userId: string;

  beforeAll(async () => {
    t = await createTestDb();

    // 1. Tenants & Stores
    const [tA] = await t.db.insert(schema.tenants).values({ name: "Tenant A Hardening", stateCode: "MH" }).returning();
    const [tB] = await t.db.insert(schema.tenants).values({ name: "Tenant B Hardening", stateCode: "MH" }).returning();
    tenantA = tA.id;
    tenantB = tB.id;

    const [u] = await t.db.insert(schema.users).values({
      name: "Hardening Admin", email: `hadmin_${Date.now()}@mediflow.test`, passwordHash: "dummy",
    }).returning();
    userId = u.id;

    const [sA] = await t.db.insert(schema.stores).values({ tenantId: tenantA, name: "Store A", code: "STA", stateCode: "MH" }).returning();
    const [sB] = await t.db.insert(schema.stores).values({ tenantId: tenantA, name: "Store B", code: "STB", stateCode: "MH" }).returning();
    storeA = sA.id;
    storeB = sB.id;

    // 2. Catalog & Batch
    const [med] = await t.db.insert(schema.medicines).values({ tenantId: tenantA, name: "Paracetamol 500mg" }).returning();
    medicineId = med.id;

    const [bA] = await t.db.insert(schema.batches).values({
      tenantId: tenantA, storeId: storeA, medicineId, batchNo: "BATCH-H1", expiryDate: "2027-12-31", purchaseRate: 1000,
    }).returning();
    batchA = bA.id;

    const currentFY = getCurrentIndianFY();
    await t.db.insert(schema.yearEndPeriodControls).values([
      { tenantId: tenantA, storeId: storeA, fiscalYear: currentFY, cutoffDate: calculateCutoffDate(currentFY), status: "open" },
      { tenantId: tenantA, storeId: storeB, fiscalYear: currentFY, cutoffDate: calculateCutoffDate(currentFY), status: "open" },
    ]).onConflictDoNothing();

    const [mA] = await t.db.insert(schema.stockMovements).values({
      tenantId: tenantA, storeId: storeA, batchId: batchA, medicineId, type: "opening", qtyChange: 10, balanceAfter: 10, unitCost: 1000,
    }).returning();
    movA = mA.id;

    accounts = await getOrSeedAccounts(t.db, tenantA);
  });

  afterAll(async () => {
    await t?.cleanup();
  });

  it("1. P0: Header-only journal without lines cannot commit", async () => {
    let err: Error | null = null;
    try {
      await t.db.insert(schema.journalEntries).values({
        tenantId: tenantA,
        storeId: storeA,
        entryNo: "JV-EMPTY-01",
        entryDate: "2026-11-01",
        narration: "Empty header attempt",
      });
    } catch (e: unknown) {
      err = e as Error;
    }
    expect(err).not.toBeNull();
    expect(String(err)).toMatch(/journal_entries/);
  });

  it("2. P0: Cross-tenant journal lines are rejected by database triggers & FK", async () => {
    await expect(
      t.db.transaction(async (tx) => {
        const [je] = await tx.insert(schema.journalEntries).values({
          tenantId: tenantA, storeId: storeA, entryNo: "JV-CROSS-01", entryDate: "2026-11-01", narration: "Cross-tenant attempt",
        }).returning();

        // Attempt to insert line belonging to Tenant B on Tenant A entry
        await tx.insert(schema.journalLines).values([
          { tenantId: tenantB, entryId: je.id, accountId: accounts.cash, debit: 1000, credit: 0 },
          { tenantId: tenantA, entryId: je.id, accountId: accounts.sales, debit: 0, credit: 1000 },
        ]);
      }),
    ).rejects.toThrow();
  });

  it("3. P0: Snapshot items composite FK prevents cross-store batch association", async () => {
    const snap = await captureOpeningInventorySnapshot(t.db, {
      tenantId: tenantA, storeId: storeA, asOfDate: "2026-11-01",
    });

    // Create a batch in store B
    const [bB] = await t.db.insert(schema.batches).values({
      tenantId: tenantA, storeId: storeB, medicineId, batchNo: "BATCH-HB", expiryDate: "2027-12-31", purchaseRate: 1000,
    }).returning();

    // Attempt to link Store B batch into Store A snapshot item
    await expect(
      t.db.insert(schema.openingInventoryItems).values({
        tenantId: tenantA,
        storeId: storeA,
        snapshotId: snap.snapshotId,
        stockMovementId: movA,
        batchId: bB.id,
        qty: 5,
        unitCostPaise: 1000,
        lineTotalPaise: 5000,
      }),
    ).rejects.toThrow();
  });

  it("4. P1: Database trigger prevents modifying or deleting posted snapshots", async () => {
    const [b] = await t.db.insert(schema.batches).values({
      tenantId: tenantA, storeId: storeA, medicineId, batchNo: "BATCH-H4", expiryDate: "2027-12-31", purchaseRate: 1000,
    }).returning();
    await t.db.insert(schema.stockMovements).values({
      tenantId: tenantA, storeId: storeA, batchId: b.id, medicineId, type: "opening", qtyChange: 5, balanceAfter: 5, unitCost: 1000,
    });

    const snap = await captureOpeningInventorySnapshot(t.db, {
      tenantId: tenantA, storeId: storeA, asOfDate: "2026-11-02",
    });
    await postInventorySnapshotJournal(t.db, { tenantId: tenantA, snapshotId: snap.snapshotId, userId });

    // Try deleting posted snapshot
    await expect(
      t.db.delete(schema.openingInventorySnapshots).where(sql`id = ${snap.snapshotId}`),
    ).rejects.toThrow();

    // Try mutating posted snapshot total
    await expect(
      t.db.update(schema.openingInventorySnapshots).set({ totalValuePaise: 999999 }).where(sql`id = ${snap.snapshotId}`),
    ).rejects.toThrow();
  });

  it("5. P1: Database trigger prevents modifying or inserting items into posted snapshot", async () => {
    const [b] = await t.db.insert(schema.batches).values({
      tenantId: tenantA, storeId: storeA, medicineId, batchNo: "BATCH-H5", expiryDate: "2027-12-31", purchaseRate: 1000,
    }).returning();
    const [m] = await t.db.insert(schema.stockMovements).values({
      tenantId: tenantA, storeId: storeA, batchId: b.id, medicineId, type: "opening", qtyChange: 8, balanceAfter: 8, unitCost: 1000,
    }).returning();

    const snap = await captureOpeningInventorySnapshot(t.db, {
      tenantId: tenantA, storeId: storeA, asOfDate: "2026-11-03",
    });
    await postInventorySnapshotJournal(t.db, { tenantId: tenantA, snapshotId: snap.snapshotId, userId });

    // Try inserting item into posted snapshot
    await expect(
      t.db.insert(schema.openingInventoryItems).values({
        tenantId: tenantA,
        storeId: storeA,
        snapshotId: snap.snapshotId,
        stockMovementId: m.id,
        batchId: b.id,
        qty: 1,
        unitCostPaise: 1000,
        lineTotalPaise: 1000,
      }),
    ).rejects.toThrow();
  });

  it("6. P1: NULL-store and Store B GL 1080 entries do not pollute Store A inventory valuation", async () => {
    const oracle = new AccountingInvariantsOracle(t.db, tenantA);
    const beforeA = await oracle.assertStockValuationPeriodicInvariant(storeA);

    // Create a tenant-wide journal (storeId: null) touching 1080
    await t.db.transaction(async (tx) => {
      const [jeCentral] = await tx.insert(schema.journalEntries).values({
        tenantId: tenantA, storeId: null, entryNo: "JV-CENTRAL-01", entryDate: "2026-11-04", narration: "Central asset adjustment",
      }).returning();
      await tx.insert(schema.journalLines).values([
        { tenantId: tenantA, entryId: jeCentral.id, accountId: accounts.inventory, debit: 500000, credit: 0 },
        { tenantId: tenantA, entryId: jeCentral.id, accountId: accounts.opening_balance_equity, debit: 0, credit: 500000 },
      ]);
    });

    // Create a Store B journal touching 1080
    await t.db.transaction(async (tx) => {
      const [jeB] = await tx.insert(schema.journalEntries).values({
        tenantId: tenantA, storeId: storeB, entryNo: "JV-STORE-B-01", entryDate: "2026-11-04", narration: "Store B stock entry",
      }).returning();
      await tx.insert(schema.journalLines).values([
        { tenantId: tenantA, entryId: jeB.id, accountId: accounts.inventory, debit: 300000, credit: 0 },
        { tenantId: tenantA, entryId: jeB.id, accountId: accounts.opening_balance_equity, debit: 0, credit: 300000 },
      ]);
    });

    // Assert Store A's periodic invariant remains strictly isolated
    const afterA = await oracle.assertStockValuationPeriodicInvariant(storeA);
    expect(afterA.gl1080Balance).toBe(beforeA.gl1080Balance);
    expect(afterA.expectedGl1080).toBe(beforeA.expectedGl1080);
  });
});
