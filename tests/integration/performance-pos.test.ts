import { describe, it, expect, beforeAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getPoolMetrics } from "@/server/observability/pool";
import { runHealthDiagnostics } from "@/server/observability/health";
import { GET as posSearchGet } from "@/app/api/pos/search/route";
import { POST as posSalePost } from "@/app/api/pos/sale/route";
import { hashDeviceToken } from "@/server/domain/devices/types";
import { NextRequest } from "next/server";
import { makeTenant, makeStore, makeUser } from "../setup/factories";
import { seedSystemRoles } from "@/server/roles";

describe("Phase 6.2 Performance & POS Concurrency Integration", () => {
  let tenantId: string;
  let storeId: string;
  let rawDeviceToken: string;
  let testMedicineId: string;
  let testBatchId: string;

  beforeAll(async () => {
    // 1. Resolve or create test tenant and store
    const tenant = await makeTenant(db);
    tenantId = tenant.id;
    const store = await makeStore(db, tenantId);
    storeId = store.id;

    // 2. Provision test device token for authorization
    const user = await makeUser(db);
    const userId = user.id;
    const roleIds = await seedSystemRoles(db, tenantId);

    await db.insert(schema.memberships).values({
      tenantId,
      userId,
      roleId: roleIds.cashier,
    });

    rawDeviceToken = `mf_dev_testperf_${Date.now()}`;
    const tokenHash = hashDeviceToken(rawDeviceToken);

    await db.insert(schema.devices).values({
      tenantId,
      storeId,
      code: "T1",
      name: "Perf Test Terminal",
      tokenHash,
      createdBy: userId,
    });

    // 3. Provision test medicine and active in-stock batch
    testMedicineId = randomUUID();
    await db.insert(schema.medicines).values({
      id: testMedicineId,
      tenantId,
      name: `PerfDolo-${Date.now()} 650mg`,
      genericName: "Paracetamol",
      composition: "Paracetamol 650mg",
      dosageForm: "tablet",
      packSize: "10 tablets",
      unit: "strip",
      unitsPerPack: 10,
      mrp: 5000,
      salePrice: 5000,
      purchasePrice: 3500,
      schedule: "none",
      isActive: true,
    });

    testBatchId = randomUUID();
    await db.insert(schema.batches).values({
      id: testBatchId,
      tenantId,
      storeId,
      medicineId: testMedicineId,
      batchNo: `B-PERF-${Date.now()}`,
      expiryDate: "2028-12-31",
      qtyOnHand: 50,
      mrp: 5000,
      purchaseRate: 3500,
      saleRate: 5000,
      status: "active",
    });
  });

  describe("1. Connection Pool Observability", () => {
    it("reports real-time pool metrics", () => {
      const metrics = getPoolMetrics();
      expect(typeof metrics.totalCount).toBe("number");
      expect(typeof metrics.idleCount).toBe("number");
      expect(typeof metrics.waitingCount).toBe("number");
      expect(metrics.totalCount).toBeGreaterThanOrEqual(0);
    });

    it("includes pool diagnostics in health check response", async () => {
      const diagnostics = await runHealthDiagnostics(db);
      expect(diagnostics.pool).toBeDefined();
      expect(diagnostics.pool?.totalCount).toBeGreaterThanOrEqual(0);
      expect(typeof diagnostics.pool?.idleCount).toBe("number");
    });
  });

  describe("2. Production-Grade POS Search Endpoint", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/pos/search?q=dolo");
      const res = await posSearchGet(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toBe("UNAUTHORIZED");
    });

    it("returns candidate medicines and active in-stock batches for authenticated cashier", async () => {
      const req = new NextRequest("http://localhost:3000/api/pos/search?q=PerfDolo", {
        headers: { Authorization: `Bearer ${rawDeviceToken}` },
      });
      const res = await posSearchGet(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.items)).toBe(true);
      expect(json.items.length).toBeGreaterThan(0);

      const match = (json.items as Array<{
        medicine: { id: string };
        batches: Array<{ id: string; qtyOnHand: number }>;
      }>).find((item) => item.medicine.id === testMedicineId);
      expect(match).toBeDefined();
      expect(match!.batches.length).toBeGreaterThan(0);
      expect(match!.batches[0].id).toBe(testBatchId);
      expect(match!.batches[0].qtyOnHand).toBe(50);
    });

    it("returns empty items array for query under 2 characters", async () => {
      const req = new NextRequest("http://localhost:3000/api/pos/search?q=a", {
        headers: { Authorization: `Bearer ${rawDeviceToken}` },
      });
      const res = await posSearchGet(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.items).toEqual([]);
    });
  });

  describe("3. Production-Grade POS Sale Commit Endpoint", () => {
    it("rejects unauthenticated checkout requests with 401", async () => {
      const req = new NextRequest("http://localhost:3000/api/pos/sale", {
        method: "POST",
        body: JSON.stringify({ lines: [] }),
      });
      const res = await posSalePost(req);
      expect(res.status).toBe(401);
    });

    it("rejects invalid payload with 400", async () => {
      const req = new NextRequest("http://localhost:3000/api/pos/sale", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${rawDeviceToken}`,
        },
        body: JSON.stringify({ lines: [] }),
      });
      const res = await posSalePost(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("VALIDATION_ERROR");
    });

    it("commits sale atomically, produces invoice, and deducts inventory", async () => {
      const clientSaleId = randomUUID();
      const req = new NextRequest("http://localhost:3000/api/pos/sale", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${rawDeviceToken}`,
        },
        body: JSON.stringify({
          clientSaleId,
          lines: [{ batchId: testBatchId, medicineId: testMedicineId, qty: 2, discountBp: 0 }],
          billDiscountPaise: 0,
          payments: [{ method: "cash", amount: 10000 }],
        }),
      });

      const res = await posSalePost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.saleId).toBeDefined();
      expect(json.invoiceNo).toBeDefined();
      expect(json.total).toBe(1000);
      expect(json.duplicate).toBe(false);

      // Verify batch stock was deducted by 2 (50 -> 48)
      const [batch] = await db
        .select({ qtyOnHand: schema.batches.qtyOnHand })
        .from(schema.batches)
        .where(eq(schema.batches.id, testBatchId));
      expect(batch.qtyOnHand).toBe(48);
    });

    it("enforces transactional idempotency on identical clientSaleId replay", async () => {
      const clientSaleId = randomUUID();
      const payload = {
        clientSaleId,
        lines: [{ batchId: testBatchId, medicineId: testMedicineId, qty: 1, discountBp: 0 }],
        billDiscountPaise: 0,
        payments: [{ method: "cash", amount: 5000 }],
      };

      // 1. Initial call
      const req1 = new NextRequest("http://localhost:3000/api/pos/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${rawDeviceToken}` },
        body: JSON.stringify(payload),
      });
      const res1 = await posSalePost(req1);
      expect(res1.status).toBe(200);
      const json1 = await res1.json();
      expect(json1.duplicate).toBe(false);

      // 2. Replay call with exact same clientSaleId
      const req2 = new NextRequest("http://localhost:3000/api/pos/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${rawDeviceToken}` },
        body: JSON.stringify(payload),
      });
      const res2 = await posSalePost(req2);
      expect(res2.status).toBe(200);
      const json2 = await res2.json();
      expect(json2.saleId).toBe(json1.saleId);
      expect(json2.invoiceNo).toBe(json1.invoiceNo);
      expect(json2.duplicate).toBe(true);

      // Stock should only have been deducted by 1 (48 -> 47)
      const [batch] = await db
        .select({ qtyOnHand: schema.batches.qtyOnHand })
        .from(schema.batches)
        .where(eq(schema.batches.id, testBatchId));
      expect(batch.qtyOnHand).toBe(47);
    });
  });
});
