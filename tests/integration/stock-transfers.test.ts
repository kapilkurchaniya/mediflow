import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { makeBatch, makeMedicine, makeStore, makeTenant, makeUser } from "../setup/factories";
import {
  createDraftTransfer,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
  getTransferById,
} from "@/server/domain/inventory/transfers";

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.cleanup();
});

describe("Stock Transfers - Lifecycle & Multi-Lot Receipts Integration", () => {
  it("complete lifecycle: draft -> dispatch -> multi-lot partial receipts -> quarantined damages", async () => {
    const tenant = await makeTenant(t.db);
    const store1 = await makeStore(t.db, tenant.id, { name: "Central Hub", stateCode: "27", gstin: "27AAAAA0000A1Z5" });
    const store2 = await makeStore(t.db, tenant.id, { name: "Retail Branch", stateCode: "27", gstin: "27AAAAA0000A1Z5" });
    const user = await makeUser(t.db);

    const med = await makeMedicine(t.db, tenant.id, { name: "Paracetamol 500mg" });
    const sourceBatch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store1.id,
      medicineId: med.id,
      batchNo: "PCM-001",
      qtyOnHand: 100,
      purchaseRate: 5000, // ₹50
      mrp: 8000,         // ₹80
    });

    const ctx = { tenantId: tenant.id, storeId: store1.id, userId: user.id };
    const destCtx = { tenantId: tenant.id, storeId: store2.id, userId: user.id };

    // 1. Create Draft Transfer
    const draftRes = await createDraftTransfer(ctx, {
      fromStoreId: store1.id,
      toStoreId: store2.id,
      notes: "Stock replenishment",
      items: [{ medicineId: med.id, fromBatchId: sourceBatch.id, qty: 50 }],
    }, t.db);

    expect(draftRes.transferId).toBeDefined();
    expect(draftRes.transferNo).toMatch(/^TRF\//);

    const initialDetails = await getTransferById(tenant.id, draftRes.transferId, t.db);
    expect(initialDetails.status).toBe("draft");
    expect(initialDetails.items).toHaveLength(1);
    const transferItemId = initialDetails.items[0]!.id;

    // 2. Dispatch Transfer
    const dispatchRes = await dispatchTransfer(ctx, {
      transferId: draftRes.transferId,
      transportMode: "road",
      vehicleNo: "MH-12-TR-9999",
      idempotencyKey: "disp-key-1",
    }, t.db);

    expect(dispatchRes.status).toBe("dispatched");
    expect(dispatchRes.documentNo).toBeDefined();

    // Verify source batch deducted
    const [updatedSourceBatch] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, sourceBatch.id));
    expect(updatedSourceBatch!.qtyOnHand).toBe(50);

    // Verify ledger stock movement recorded
    const movements = await t.db
      .select()
      .from(schema.stockMovements)
      .where(
        and(
          eq(schema.stockMovements.tenantId, tenant.id),
          eq(schema.stockMovements.storeId, store1.id),
          eq(schema.stockMovements.refId, draftRes.transferId),
        ),
      );
    expect(movements).toHaveLength(1);
    expect(movements[0]!.type).toBe("transfer_out");
    expect(movements[0]!.qtyChange).toBe(-50);

    // 3. Multi-Lot Partial Receipt - Lot 1: 30 units
    const lot1Res = await receiveTransfer(destCtx, {
      transferId: draftRes.transferId,
      idempotencyKey: "lot-1-key",
      items: [{ itemId: transferItemId, qtyReceived: 30, qtyDamaged: 0, qtyShortage: 0 }],
    }, t.db);

    expect(lot1Res.status).toBe("partially_received");
    expect(lot1Res.idempotentReplay).toBe(false);

    // Destination batch created with 30 units
    const [destBatch] = await t.db
      .select()
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.tenantId, tenant.id),
          eq(schema.batches.storeId, store2.id),
          eq(schema.batches.medicineId, med.id),
          eq(schema.batches.batchNo, "PCM-001"),
        ),
      );
    expect(destBatch).toBeDefined();
    expect(destBatch!.qtyOnHand).toBe(30);

    // Idempotency check: Replay lot 1
    const replayRes = await receiveTransfer(destCtx, {
      transferId: draftRes.transferId,
      idempotencyKey: "lot-1-key",
      items: [{ itemId: transferItemId, qtyReceived: 30, qtyDamaged: 0, qtyShortage: 0 }],
    }, t.db);
    expect(replayRes.idempotentReplay).toBe(true);

    const [destBatchAfterReplay] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, destBatch!.id));
    expect(destBatchAfterReplay!.qtyOnHand).toBe(30);

    // 4. Multi-Lot Partial Receipt - Lot 2: 15 accepted + 3 damaged + 2 shortage
    const lot2Res = await receiveTransfer(destCtx, {
      transferId: draftRes.transferId,
      idempotencyKey: "lot-2-key",
      items: [{ itemId: transferItemId, qtyReceived: 15, qtyDamaged: 3, qtyShortage: 2, discrepancyReason: "Transit breakage" }],
    }, t.db);

    expect(lot2Res.status).toBe("received");

    const [finalDestBatch] = await t.db
      .select()
      .from(schema.batches)
      .where(eq(schema.batches.id, destBatch!.id));
    expect(finalDestBatch!.qtyOnHand).toBe(45);

    const qBatches = await t.db
      .select()
      .from(schema.quarantineBatches)
      .where(
        and(
          eq(schema.quarantineBatches.tenantId, tenant.id),
          eq(schema.quarantineBatches.storeId, store2.id),
          eq(schema.quarantineBatches.medicineId, med.id),
        ),
      );
    expect(qBatches).toHaveLength(1);
    expect(qBatches[0]!.qty).toBe(3);
    expect(qBatches[0]!.reason).toBe("damaged");
    expect(qBatches[0]!.status).toBe("quarantined");

    const finalDetails = await getTransferById(tenant.id, draftRes.transferId, t.db);
    expect(finalDetails.status).toBe("received");
    expect(finalDetails.items[0]!.receivedQty).toBe(45);
    expect(finalDetails.items[0]!.qtyDamaged).toBe(3);
    expect(finalDetails.items[0]!.qtyShortage).toBe(2);
  });

  it("insufficient stock prevents dispatch", async () => {
    const tenant = await makeTenant(t.db);
    const store1 = await makeStore(t.db, tenant.id);
    const store2 = await makeStore(t.db, tenant.id);
    const user = await makeUser(t.db);

    const med = await makeMedicine(t.db, tenant.id);
    const batch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store1.id,
      medicineId: med.id,
      qtyOnHand: 10,
    });

    const ctx = { tenantId: tenant.id, storeId: store1.id, userId: user.id };

    const draft = await createDraftTransfer(ctx, {
      fromStoreId: store1.id,
      toStoreId: store2.id,
      items: [{ medicineId: med.id, fromBatchId: batch.id, qty: 25 }],
    }, t.db);

    await expect(
      dispatchTransfer(ctx, {
        transferId: draft.transferId,
        idempotencyKey: "insufficient-stock-key",
      }, t.db),
    ).rejects.toThrow();
  });

  it("only draft transfers can be cancelled; dispatched transfers cannot", async () => {
    const tenant = await makeTenant(t.db);
    const store1 = await makeStore(t.db, tenant.id);
    const store2 = await makeStore(t.db, tenant.id);
    const user = await makeUser(t.db);

    const med = await makeMedicine(t.db, tenant.id);
    const batch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store1.id,
      medicineId: med.id,
      qtyOnHand: 50,
    });

    const ctx = { tenantId: tenant.id, storeId: store1.id, userId: user.id };

    // 1. Cancel a draft transfer successfully
    const draft = await createDraftTransfer(ctx, {
      fromStoreId: store1.id,
      toStoreId: store2.id,
      items: [{ medicineId: med.id, fromBatchId: batch.id, qty: 10 }],
    }, t.db);

    const cancelRes = await cancelTransfer(ctx, {
      transferId: draft.transferId,
      reason: "Order no longer needed",
    }, t.db);

    expect(cancelRes.status).toBe("cancelled");

    // 2. Dispatched transfer cannot be cancelled
    const draft2 = await createDraftTransfer(ctx, {
      fromStoreId: store1.id,
      toStoreId: store2.id,
      items: [{ medicineId: med.id, fromBatchId: batch.id, qty: 10 }],
    }, t.db);

    await dispatchTransfer(ctx, {
      transferId: draft2.transferId,
      idempotencyKey: "dispatch-key-2",
    }, t.db);

    await expect(
      cancelTransfer(ctx, {
        transferId: draft2.transferId,
        reason: "Try cancel in transit",
      }, t.db),
    ).rejects.toThrow(/Only draft transfers can be cancelled/);
  });

  it("destination authorization guard: users scoped to source store cannot receive", async () => {
    const tenant = await makeTenant(t.db);
    const store1 = await makeStore(t.db, tenant.id);
    const store2 = await makeStore(t.db, tenant.id);
    const user = await makeUser(t.db);

    const med = await makeMedicine(t.db, tenant.id);
    const batch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store1.id,
      medicineId: med.id,
      qtyOnHand: 50,
    });

    const ctx = { tenantId: tenant.id, storeId: store1.id, userId: user.id };

    const draft = await createDraftTransfer(ctx, {
      fromStoreId: store1.id,
      toStoreId: store2.id,
      items: [{ medicineId: med.id, fromBatchId: batch.id, qty: 10 }],
    }, t.db);

    await dispatchTransfer(ctx, {
      transferId: draft.transferId,
      idempotencyKey: "disp-guard-key",
    }, t.db);

    const details = await getTransferById(tenant.id, draft.transferId, t.db);

    // Call receiveTransfer with source store context (store1) instead of destination store (store2)
    await expect(
      receiveTransfer(ctx, {
        transferId: draft.transferId,
        idempotencyKey: "rec-unauth",
        items: [{ itemId: details.items[0]!.id, qtyReceived: 10 }],
      }, t.db),
    ).rejects.toThrow(/Only users authorized for destination store/);
  });
});
