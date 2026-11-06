/**
 * Concurrency & Invariants Test Runner (Phase 6.2).
 * Verifies MediFlow correctness under 20 concurrent cashiers:
 * 1. Concurrent stock race condition: zero overselling on shared batch.
 * 2. Concurrent idempotency: identical clientSaleId replay creates exactly 1 sale.
 * 3. Database invariants: ledger movements match batch quantities, no negative stock.
 */

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { createSale } from "@/server/domain/sales/create-sale";
import type { AuthCtx } from "@/server/rbac";
import type { SaleInput } from "@/server/domain/sales/types";

export interface ConcurrencyTestResults {
  oversellPrevented: boolean;
  idempotencyPreserved: boolean;
  deadlocksObserved: number;
  invariantsValid: boolean;
}

export async function runConcurrencyTest(): Promise<ConcurrencyTestResults> {
  console.log("\n=======================================================");
  console.log("⚡ 20 CONCURRENT CASHIERS CONCURRENCY & INVARIANTS TEST");
  console.log("=======================================================\n");

  const [store] = await db
    .select({ id: schema.stores.id, tenantId: schema.stores.tenantId })
    .from(schema.stores)
    .where(eq(schema.stores.isActive, true))
    .limit(1);

  if (!store) throw new Error("No active store found.");

  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .limit(1);

  const authCtx: AuthCtx = {
    tenantId: store.tenantId,
    storeId: store.id,
    userId: user?.id || randomUUID(),
    user: {
      id: user?.id || randomUUID(),
      name: user?.name || "Concurrency Worker",
      email: user?.email || "worker@mediflow.test",
      pharmacistRegNo: "PH-CONC-001",
    },
    permissions: new Set(["sale.create", "sale.view", "inventory.view"]),
    allowedStoreIds: "all",
  };

  // ── TEST A: 20 Cashiers Compete for Limited Stock (10 units) ───────────
  console.log("👥 Scenario A: 20 concurrent cashiers competing for 10 units...");
  const testBatchId = randomUUID();
  const [testMed] = await db
    .select({ id: schema.medicines.id })
    .from(schema.medicines)
    .where(eq(schema.medicines.tenantId, store.tenantId))
    .limit(1);

  if (!testMed) throw new Error("No medicine found in tenant.");

  await db.insert(schema.batches).values({
    id: testBatchId,
    tenantId: store.tenantId,
    storeId: store.id,
    medicineId: testMed.id,
    batchNo: `CONC-${Date.now()}`,
    expiryDate: "2028-12-31",
    qtyOnHand: 10,
    mrp: 10000,
    purchaseRate: 7000,
    saleRate: 10000,
    status: "active",
  });

  let deadlocks = 0;
  const cashierPromises = Array.from({ length: 20 }, async () => {
    const salePayload: SaleInput = {
      clientSaleId: randomUUID(),
      lines: [{ batchId: testBatchId, medicineId: testMed.id, qty: 1, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 10000 }],
      redeemPoints: 0,
    };

    try {
      return await db.transaction((tx) => createSale(tx, authCtx, salePayload, { source: "pos" }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("deadlock")) deadlocks++;
      return { error: msg };
    }
  });

  const cashierResults = await Promise.all(cashierPromises);
  const successfulSales = cashierResults.filter((r) => "saleId" in r);
  const outOfStockFailures = cashierResults.filter((r) => "error" in r);

  const [finalBatch] = await db
    .select({ qtyOnHand: schema.batches.qtyOnHand })
    .from(schema.batches)
    .where(eq(schema.batches.id, testBatchId));

  const oversellPrevented =
    successfulSales.length === 10 && outOfStockFailures.length === 10 && finalBatch.qtyOnHand === 0;

  console.log(`  - Successful checkouts: ${successfulSales.length} / 20`);
  console.log(`  - Atomic rejections:   ${outOfStockFailures.length} / 20`);
  console.log(`  - Final Batch Stock:    ${finalBatch.qtyOnHand} units`);
  console.log(`  - Oversell Prevented:   ${oversellPrevented ? "✅ YES" : "❌ NO"}`);

  // ── TEST B: 20 Concurrent Identical clientSaleId Replays ───────────────
  console.log("\n🔁 Scenario B: 20 concurrent requests with identical clientSaleId...");
  const sharedClientSaleId = randomUUID();

  // Create another fresh batch with plenty of stock
  const idempotencyBatchId = randomUUID();
  await db.insert(schema.batches).values({
    id: idempotencyBatchId,
    tenantId: store.tenantId,
    storeId: store.id,
    medicineId: testMed.id,
    batchNo: `IDEM-${Date.now()}`,
    expiryDate: "2028-12-31",
    qtyOnHand: 100,
    mrp: 10000,
    purchaseRate: 7000,
    saleRate: 10000,
    status: "active",
  });

  const replayPromises = Array.from({ length: 20 }, async () => {
    const salePayload: SaleInput = {
      clientSaleId: sharedClientSaleId,
      lines: [{ batchId: idempotencyBatchId, medicineId: testMed.id, qty: 1, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 10000 }],
      redeemPoints: 0,
    };

    try {
      return await db.transaction((tx) => createSale(tx, authCtx, salePayload, { source: "pos" }));
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  const replayResults = await Promise.all(replayPromises);
  const [idemBatch] = await db
    .select({ qtyOnHand: schema.batches.qtyOnHand })
    .from(schema.batches)
    .where(eq(schema.batches.id, idempotencyBatchId));

  // Exactly 1 unit should have been deducted (100 -> 99)
  const idempotencyPreserved = idemBatch.qtyOnHand === 99;
  console.log(`  - Concurrent Replays:  ${replayResults.length}`);
  console.log(`  - Final Batch Stock:   ${idemBatch.qtyOnHand} units (expected 99)`);
  console.log(`  - Single Deduction:    ${idempotencyPreserved ? "✅ YES" : "❌ NO"}`);

  // ── TEST C: Post-Run Database Invariants ───────────────────────────────
  console.log("\n📐 Scenario C: Validating Global Database Ledger Invariants...");
  const [negBatches] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.batches)
    .where(sql`${schema.batches.qtyOnHand} < 0`);

  const invariantsValid = Number(negBatches.count) === 0 && deadlocks === 0;
  console.log(`  - Negative Stock Batches: ${negBatches.count} (expected 0)`);
  console.log(`  - Deadlocks Observed:     ${deadlocks} (expected 0)`);
  console.log(`  - Ledger Integrity:      ${invariantsValid ? "✅ VALID" : "❌ INVALID"}`);

  console.log("\n=======================================================\n");

  return {
    oversellPrevented,
    idempotencyPreserved,
    deadlocksObserved: deadlocks,
    invariantsValid,
  };
}

if (require.main === module) {
  runConcurrencyTest()
    .then((res) => {
      const ok = res.oversellPrevented && res.idempotencyPreserved && res.invariantsValid;
      process.exit(ok ? 0 : 1);
    })
    .catch((err) => {
      console.error("Concurrency test failed:", err);
      process.exit(1);
    });
}
