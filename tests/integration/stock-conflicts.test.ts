import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { makeBatch, makeMedicine, makeStore, makeTenant, makeUser } from "../setup/factories";
import {
  listStoreConflicts,
  getConflictDetails,
  resolveWithPhysicalRecount,
  resolveWithBatchReallocation,
  dismissConflictCase,
} from "@/server/domain/conflicts";
import { receiveTransfer } from "@/server/domain/inventory/transfers/receive";

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.cleanup();
});

describe("Task A4.7: Stock Conflicts Integration Tests", () => {
  async function setupWorld() {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id);
    const user = await makeUser(t.db);
    const medicine = await makeMedicine(t.db, tenant.id);
    const sourceBatch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      medicineId: medicine.id,
      batchNo: "SRC01",
      qtyOnHand: -3,
    });
    const targetBatch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      medicineId: medicine.id,
      batchNo: "TGT01",
      qtyOnHand: 10,
    });

    const [conflictCase] = await t.db
      .insert(schema.stockConflictCases)
      .values({
        tenantId: tenant.id,
        storeId: store.id,
        batchId: sourceBatch.id,
        medicineId: medicine.id,
        status: "open",
        requiredReconciliationQty: 3,
        reconciledQty: 0,
      })
      .returning();

    return { tenant, store, user, medicine, sourceBatch, targetBatch, conflictCase };
  }

  it("lists store conflicts and filters correctly", async () => {
    const { tenant, store, conflictCase } = await setupWorld();

    const conflicts = await listStoreConflicts(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
    });

    expect(conflicts.length).toBe(1);
    expect(conflicts[0].id).toBe(conflictCase.id);
    expect(conflicts[0].outstandingQty).toBe(3);
    expect(conflicts[0].qtyOnHand).toBe(-3);
  });

  it("retrieves conflict details with alternative batches", async () => {
    const { tenant, store, conflictCase, targetBatch } = await setupWorld();

    const details = await getConflictDetails(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      conflictCaseId: conflictCase.id,
    });

    expect(details.conflictCase.id).toBe(conflictCase.id);
    expect(details.conflictCase.outstandingQty).toBe(3);
    expect(details.alternativeBatches.length).toBe(1);
    expect(details.alternativeBatches[0].id).toBe(targetBatch.id);
  });

  it("resolves conflict with physical recount discovery (observed > 0)", async () => {
    const { tenant, store, user, sourceBatch, conflictCase } = await setupWorld();

    const result = await resolveWithPhysicalRecount(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      conflictCaseId: conflictCase.id,
      observedCount: 5,
      userId: user.id,
      notes: "Physical shelf count discovery",
      operationKey: `test_recount_${Date.now()}`,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("resolved");

    const [updatedBatch] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, sourceBatch.id));
    expect(updatedBatch.qtyOnHand).toBe(5);

    const [updatedCase] = await t.db
      .select()
      .from(schema.stockConflictCases)
      .where(eq(schema.stockConflictCases.id, conflictCase.id));
    expect(updatedCase.status).toBe("resolved");
    expect(updatedCase.reconciledQty).toBe(3);
  });

  it("resolves conflict with confirmed zero physical stock (reconciliation offset)", async () => {
    const { tenant, store, user, sourceBatch, conflictCase } = await setupWorld();

    const result = await resolveWithPhysicalRecount(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      conflictCaseId: conflictCase.id,
      observedCount: 0,
      userId: user.id,
      notes: "Confirmed zero physical stock on shelf",
      operationKey: `test_zero_${Date.now()}`,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("resolved");

    const [updatedBatch] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, sourceBatch.id));
    expect(updatedBatch.qtyOnHand).toBe(0);

    const [updatedCase] = await t.db
      .select()
      .from(schema.stockConflictCases)
      .where(eq(schema.stockConflictCases.id, conflictCase.id));
    expect(updatedCase.status).toBe("resolved");
    expect(updatedCase.resolutionType).toBe("shortage_reconciliation");
  });

  it("resolves conflict with audited batch reallocation", async () => {
    const { tenant, store, user, sourceBatch, targetBatch, conflictCase } = await setupWorld();

    const result = await resolveWithBatchReallocation(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      conflictCaseId: conflictCase.id,
      targetBatchId: targetBatch.id,
      reallocateQty: 3,
      userId: user.id,
      dispensingEvidence: "Physical strip dispensed from batch TGT01 due to barcode mis-scan",
      operationKey: `test_realloc_${Date.now()}`,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("resolved");

    const [updatedSource] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, sourceBatch.id));
    expect(updatedSource.qtyOnHand).toBe(0); // -3 + 3 = 0

    const [updatedTarget] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, targetBatch.id));
    expect(updatedTarget.qtyOnHand).toBe(7); // 10 - 3 = 7

    const [updatedCase] = await t.db
      .select()
      .from(schema.stockConflictCases)
      .where(eq(schema.stockConflictCases.id, conflictCase.id));
    expect(updatedCase.status).toBe("resolved");
    expect(updatedCase.reconciledQty).toBe(3);
    expect(updatedCase.resolutionType).toBe("batch_reallocation");
  });

  it("dismisses conflict case with mandatory reason and audit entry", async () => {
    const { tenant, store, user, sourceBatch, conflictCase } = await setupWorld();

    const result = await dismissConflictCase(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      conflictCaseId: conflictCase.id,
      userId: user.id,
      reason: "Administrative duplicate verified by store manager",
      operationKey: `test_dismiss_${Date.now()}`,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("dismissed");

    // Batch quantity should remain untouched
    const [batch] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, sourceBatch.id));
    expect(batch.qtyOnHand).toBe(-3);

    const [updatedCase] = await t.db
      .select()
      .from(schema.stockConflictCases)
      .where(eq(schema.stockConflictCases.id, conflictCase.id));
    expect(updatedCase.status).toBe("dismissed");
    expect(updatedCase.resolutionNotes).toBe("Administrative duplicate verified by store manager");
  });

  it("reconciles active conflict case when stock transfer is received at destination", async () => {
    const { tenant, store, user, medicine, sourceBatch, conflictCase } = await setupWorld();
    const sourceStore = await makeStore(t.db, tenant.id);
    const originBatch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: sourceStore.id,
      medicineId: medicine.id,
      batchNo: sourceBatch.batchNo,
      expiryDate: sourceBatch.expiryDate,
      qtyOnHand: 20,
    });

    const [transfer] = await t.db
      .insert(schema.stockTransfers)
      .values({
        tenantId: tenant.id,
        transferNo: `TR-TEST-${Date.now()}`,
        fromStoreId: sourceStore.id,
        toStoreId: store.id,
        status: "dispatched",
        createdBy: user.id,
        dispatchedBy: user.id,
      })
      .returning();

    const [item] = await t.db
      .insert(schema.stockTransferItems)
      .values({
        tenantId: tenant.id,
        transferId: transfer.id,
        medicineId: medicine.id,
        fromBatchId: originBatch.id,
        toBatchId: sourceBatch.id,
        batchNo: sourceBatch.batchNo,
        expiryDate: sourceBatch.expiryDate,
        qty: 3,
        qtyDispatched: 3,
      })
      .returning();

    await receiveTransfer(
      { tenantId: tenant.id, storeId: store.id, userId: user.id },
      {
        transferId: transfer.id,
        idempotencyKey: `rcv_trf_${Date.now()}`,
        items: [{ itemId: item.id, qtyReceived: 3 }],
      },
      t.db,
    );

    const [updatedCase] = await t.db
      .select()
      .from(schema.stockConflictCases)
      .where(eq(schema.stockConflictCases.id, conflictCase.id));
    expect(updatedCase.status).toBe("resolved");
    expect(updatedCase.reconciledQty).toBe(3);
    expect(updatedCase.resolutionType).toBe("transfer");
  });
});
