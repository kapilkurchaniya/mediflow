import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { POST as posSalePost } from "@/app/api/pos/sale/route";
import { hashDeviceToken } from "@/server/domain/devices/types";
import { NextRequest } from "next/server";
import { makeTenant, makeStore, makeUser, makeCustomer } from "../setup/factories";
import { seedSystemRoles } from "@/server/roles";

describe("Phase 6.2 POS Financial Atomicity & Transaction Rollback", () => {
  let tenantId: string;
  let storeId: string;
  let rawDeviceToken: string;
  let testMedicineId: string;
  let testBatchId: string;

  beforeAll(async () => {
    const tenant = await makeTenant(db);
    tenantId = tenant.id;
    const store = await makeStore(db, tenantId);
    storeId = store.id;

    const user = await makeUser(db);
    const roleIds = await seedSystemRoles(db, tenantId);

    await db.insert(schema.memberships).values({
      tenantId,
      userId: user.id,
      roleId: roleIds.cashier,
    });

    rawDeviceToken = `mf_dev_atomicity_${Date.now()}`;
    await db.insert(schema.devices).values({
      tenantId,
      storeId,
      code: "A1",
      name: "Atomicity Test Device",
      tokenHash: hashDeviceToken(rawDeviceToken),
      createdBy: user.id,
    });

    testMedicineId = randomUUID();
    await db.insert(schema.medicines).values({
      id: testMedicineId,
      tenantId,
      name: `AtomicityMed-${Date.now()}`,
      genericName: "Paracetamol",
      composition: "Paracetamol 500mg",
      dosageForm: "tablet",
      packSize: "10 tablets",
      unit: "strip",
      unitsPerPack: 10,
      packUnit: "strip",
      looseUnit: "tablet",
      hsn: "30049099",
      gstRateBp: 500,
      mrp: 5000,
      salePrice: 5000,
      purchasePrice: 3000,
      isActive: true,
    });

    testBatchId = randomUUID();
    await db.insert(schema.batches).values({
      id: testBatchId,
      tenantId,
      storeId,
      medicineId: testMedicineId,
      batchNo: `BATCH-ATOM-${Date.now()}`,
      expiryDate: "2028-12-31",
      mfgDate: "2024-01-01",
      purchaseRate: 3000,
      mrp: 5000,
      saleRate: 5000,
      qtyOnHand: 100,
      status: "active",
    });
  });

  it("commits sale, sale items, payments, stock movements, gst docs, and outbox atomically", async () => {
    const customer = await makeCustomer(db, tenantId, { phone: "9876543210", name: "Rajesh Kumar" });
    const clientSaleId = randomUUID();
    const salePayload = {
      clientSaleId,
      customerId: customer.id,
      lines: [{ batchId: testBatchId, medicineId: testMedicineId, qty: 2, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 1000 }],
      redeemPoints: 0,
    };

    const req = new NextRequest("http://localhost:3000/api/pos/sale", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawDeviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(salePayload),
    });

    const res = await posSalePost(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    const saleId = json.saleId;

    // 1. Verify sale header
    const [sale] = await db.select().from(schema.sales).where(eq(schema.sales.id, saleId));
    expect(sale).toBeDefined();
    expect(sale.totalAmount).toBe(1000);

    // 2. Verify sale items
    const items = await db.select().from(schema.saleItems).where(eq(schema.saleItems.saleId, saleId));
    expect(items.length).toBe(1);
    expect(items[0].batchId).toBe(testBatchId);

    // 3. Verify sale payments
    const payments = await db.select().from(schema.salePayments).where(eq(schema.salePayments.saleId, saleId));
    expect(payments.length).toBe(1);
    expect(payments[0].amount).toBe(1000);

    // 4. Verify stock movement ledger
    const movements = await db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.batchId, testBatchId));
    const saleMovement = movements.find((m) => m.type === "sale");
    expect(saleMovement).toBeDefined();
    expect(saleMovement!.qtyChange).toBe(-2);

    // 5. Verify batch quantity deduction
    const [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, testBatchId));
    expect(batch.qtyOnHand).toBe(98);

    // 6. Verify GST document creation
    const gstDocs = await db
      .select()
      .from(schema.gstDocuments)
      .where(and(eq(schema.gstDocuments.refType, "sale"), eq(schema.gstDocuments.refId, saleId)));
    expect(gstDocs.length).toBe(1);

    // 7. Verify outbox events (WhatsApp receipt event)
    const outbox = await db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.tenantId, tenantId));
    const whatsappEvent = outbox.find((o) => o.type === "whatsapp.receipt");
    expect(whatsappEvent).toBeDefined();

    // 8. Verify idempotency record
    const [idem] = await db
      .select()
      .from(schema.idempotencyKeys)
      .where(
        and(
          eq(schema.idempotencyKeys.tenantId, tenantId),
          eq(schema.idempotencyKeys.scope, "sale"),
          eq(schema.idempotencyKeys.key, clientSaleId)
        )
      );
    expect(idem).toBeDefined();
    expect(idem.response).toBeDefined();
    expect((idem.response as { saleId: string }).saleId).toBe(saleId);
  });

  it("rolls back all records completely when transaction fails", async () => {
    const clientSaleId = randomUUID();
    // Request more than available stock (98 units available, request 500)
    const failingPayload = {
      clientSaleId,
      lines: [{ batchId: testBatchId, medicineId: testMedicineId, qty: 500, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 250000 }],
      redeemPoints: 0,
    };

    const req = new NextRequest("http://localhost:3000/api/pos/sale", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawDeviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(failingPayload),
    });

    const res = await posSalePost(req);
    expect(res.status).toBe(400);

    // 1. Verify no sale created
    const sales = await db
      .select()
      .from(schema.sales)
      .where(eq(schema.sales.tenantId, tenantId));
    expect(sales.length).toBe(1); // Only the previous successful test

    // 2. Verify batch stock completely untouched
    const [batch] = await db.select().from(schema.batches).where(eq(schema.batches.id, testBatchId));
    expect(batch.qtyOnHand).toBe(98); // Unchanged

    // 3. Verify no extra stock movements
    const movements = await db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.batchId, testBatchId));
    expect(movements.length).toBe(1); // Only the previous successful test
  });

  it("prevents duplicate effects on retry with identical clientSaleId", async () => {
    const clientSaleId = randomUUID();
    const payload = {
      clientSaleId,
      lines: [{ batchId: testBatchId, medicineId: testMedicineId, qty: 1, discountBp: 0 }],
      billDiscountPaise: 0,
      payments: [{ method: "cash", amount: 500 }],
      redeemPoints: 0,
    };

    const makeReq = () =>
      new NextRequest("http://localhost:3000/api/pos/sale", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${rawDeviceToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

    const res1 = await posSalePost(makeReq());
    expect(res1.status).toBe(200);
    const json1 = await res1.json();
    expect(json1.duplicate).toBe(false);

    // Initial stock was 98, now 97
    const [batch1] = await db.select().from(schema.batches).where(eq(schema.batches.id, testBatchId));
    expect(batch1.qtyOnHand).toBe(97);

    // Replay 1
    const res2 = await posSalePost(makeReq());
    expect(res2.status).toBe(200);
    const json2 = await res2.json();
    expect(json2.duplicate).toBe(true);
    expect(json2.saleId).toBe(json1.saleId);

    // Replay 2
    const res3 = await posSalePost(makeReq());
    expect(res3.status).toBe(200);
    const json3 = await res3.json();
    expect(json3.duplicate).toBe(true);

    // Stock must STILL be 97 (no duplicate deductions)
    const [batch2] = await db.select().from(schema.batches).where(eq(schema.batches.id, testBatchId));
    expect(batch2.qtyOnHand).toBe(97);
  });
});
