import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { makeBatch, makeMedicine, makeStore, makeTenant, makeUser } from "../setup/factories";
import { registerDevice } from "@/server/domain/devices";
import { authenticateDevice } from "@/server/domain/devices/auth";
import { formatDeviceInvoiceNo, getFiscalYear, reserveDeviceInvoiceNumbers } from "@/server/domain/sync/numbers";
import { ingestOfflineSales } from "@/server/domain/sync/sales";
import type { AuthCtx } from "@/server/rbac";

vi.mock("@/server/auth", () => ({
  requireAuth: async () => {
    throw new Error("not used");
  },
  getCurrentSession: async () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.cleanup();
});

describe("Task A4.3: Offline Sales Ingestion & Reconciliation", () => {
  async function setupWorld() {
    const tenant = await makeTenant(t.db);
    const store = await makeStore(t.db, tenant.id, { code: "AP" });
    const user = await makeUser(t.db);

    const [role] = await t.db
      .insert(schema.roles)
      .values({ tenantId: tenant.id, key: "cashier", name: "Cashier" })
      .returning();

    await t.db.insert(schema.rolePermissions).values({ roleId: role.id, permission: "sale.create" });

    await t.db.insert(schema.memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      roleId: role.id,
      status: "active",
      allStores: true,
    });

    const adminCtx: AuthCtx = {
      tenantId: tenant.id,
      storeId: store.id,
      userId: user.id,
      user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: null },
      permissions: new Set(["settings.manage"]),
      allowedStoreIds: "all",
    };

    const reg = await registerDevice(t.db, adminCtx, {
      code: "01",
      name: "Checkout 1",
      platform: "desktop",
      storeId: store.id,
    });

    const deviceCtx = await authenticateDevice(t.db, `Bearer ${reg.rawToken}`);
    const medicine = await makeMedicine(t.db, tenant.id, { name: "Paracetamol 500mg" });
    const batch = await makeBatch(t.db, {
      tenantId: tenant.id,
      storeId: store.id,
      medicineId: medicine.id,
      qtyOnHand: 20,
    });

    const fy = getFiscalYear();
    const reservation = await reserveDeviceInvoiceNumbers(t.db, deviceCtx, {
      clientReservationId: "res-sales-01",
      count: 20,
    });

    return { tenant, store, user, deviceCtx, medicine, batch, fy, reservation };
  }

  it("processes sales with per-sale transaction isolation (valid sales commit when invalid fail)", async () => {
    const { tenant, store, user, deviceCtx, medicine, batch, fy, reservation } = await setupWorld();

    const clientSaleId1 = crypto.randomUUID();
    const clientSaleId2 = crypto.randomUUID();
    const invoiceNo1 = formatDeviceInvoiceNo({ storeCode: store.code, deviceCode: deviceCtx.code, fiscalYear: fy, sequence: 1 });
    const invoiceNo2 = formatDeviceInvoiceNo({ storeCode: store.code, deviceCode: deviceCtx.code, fiscalYear: fy, sequence: 999 });

    const res = await ingestOfflineSales(t.db, deviceCtx, {
      sales: [
        {
          clientSaleId: clientSaleId1,
          invoiceNo: invoiceNo1,
          fiscalYear: fy,
          sequenceNumber: 1,
          reservationId: reservation.reservationId,
          createdBy: user.id,
          completedAt: new Date().toISOString(),
          lines: [{ batchId: batch.id, medicineId: medicine.id, qty: 5, discountBp: 0 }],
          payments: [{ method: "cash", amount: 50000 }],
        },
        {
          clientSaleId: clientSaleId2,
          invoiceNo: invoiceNo2,
          fiscalYear: fy,
          sequenceNumber: 999,
          createdBy: user.id,
          completedAt: new Date().toISOString(),
          lines: [{ batchId: batch.id, medicineId: medicine.id, qty: 5, discountBp: 0 }],
          payments: [{ method: "cash", amount: 50000 }],
        },
      ],
    });

    expect(res.results.length).toBe(2);
    const r0 = res.results[0];
    const r1 = res.results[1];
    expect(r0.status).toBe("created");
    expect(r1.status).toBe("rejected");
    if (r1.status === "rejected") {
      expect(r1.code).toBe("RESERVATION_MISMATCH");
    }

    const [savedSale] = await t.db
      .select()
      .from(schema.sales)
      .where(and(eq(schema.sales.tenantId, tenant.id), eq(schema.sales.invoiceNo, invoiceNo1)));
    expect(savedSale).toBeDefined();
  });

  it("handles idempotency: returns duplicate on identical retry, rejects payload mutation", async () => {
    const { store, user, deviceCtx, medicine, batch, fy, reservation } = await setupWorld();

    const clientSaleId = crypto.randomUUID();
    const invoiceNo = formatDeviceInvoiceNo({ storeCode: store.code, deviceCode: deviceCtx.code, fiscalYear: fy, sequence: 2 });

    const salePayload = {
      clientSaleId,
      invoiceNo,
      fiscalYear: fy,
      sequenceNumber: 2,
      reservationId: reservation.reservationId,
      createdBy: user.id,
      completedAt: new Date().toISOString(),
      lines: [{ batchId: batch.id, medicineId: medicine.id, qty: 2, discountBp: 0 }],
      payments: [{ method: "cash" as const, amount: 20000 }],
    };

    const firstRes = await ingestOfflineSales(t.db, deviceCtx, { sales: [salePayload] });
    const rFirst = firstRes.results[0];
    expect(rFirst.status).toBe("created");

    const secondRes = await ingestOfflineSales(t.db, deviceCtx, { sales: [salePayload] });
    const rSecond = secondRes.results[0];
    expect(rSecond.status).toBe("duplicate");
    if (rFirst.status === "created" && rSecond.status === "duplicate") {
      expect(rSecond.saleId).toBe(rFirst.saleId);
    }

    const mutatedPayload = {
      ...salePayload,
      lines: [{ batchId: batch.id, medicineId: medicine.id, qty: 5, discountBp: 0 }],
      payments: [{ method: "cash" as const, amount: 50000 }],
    };
    const thirdRes = await ingestOfflineSales(t.db, deviceCtx, { sales: [mutatedPayload] });
    const rThird = thirdRes.results[0];
    expect(rThird.status).toBe("rejected");
    if (rThird.status === "rejected") {
      expect(rThird.code).toBe("IDEMPOTENCY_PAYLOAD_MISMATCH");
    }
  });

  it("rejects unauthorized cashiers without active store membership or sale permission", async () => {
    const { store, deviceCtx, medicine, batch, fy, reservation } = await setupWorld();

    const badCashierId = crypto.randomUUID();
    const invoiceNo = formatDeviceInvoiceNo({ storeCode: store.code, deviceCode: deviceCtx.code, fiscalYear: fy, sequence: 3 });

    const res = await ingestOfflineSales(t.db, deviceCtx, {
      sales: [
        {
          clientSaleId: crypto.randomUUID(),
          invoiceNo,
          fiscalYear: fy,
          sequenceNumber: 3,
          reservationId: reservation.reservationId,
          createdBy: badCashierId,
          completedAt: new Date().toISOString(),
          lines: [{ batchId: batch.id, medicineId: medicine.id, qty: 1, discountBp: 0 }],
          payments: [{ method: "cash", amount: 10000 }],
        },
      ],
    });

    const rAuth = res.results[0];
    expect(rAuth.status).toBe("rejected");
    if (rAuth.status === "rejected") {
      expect(rAuth.code).toBe("CASHIER_UNAUTHORIZED");
    }
  });

  it("allows negative stock reconciliation and generates deduplicated conflict notification", async () => {
    const { tenant, store, user, deviceCtx, medicine, batch, fy, reservation } = await setupWorld();

    const clientSaleId1 = crypto.randomUUID();
    const invoiceNo1 = formatDeviceInvoiceNo({ storeCode: store.code, deviceCode: deviceCtx.code, fiscalYear: fy, sequence: 4 });

    const res1 = await ingestOfflineSales(t.db, deviceCtx, {
      sales: [
        {
          clientSaleId: clientSaleId1,
          invoiceNo: invoiceNo1,
          fiscalYear: fy,
          sequenceNumber: 4,
          reservationId: reservation.reservationId,
          createdBy: user.id,
          completedAt: new Date().toISOString(),
          lines: [{ batchId: batch.id, medicineId: medicine.id, qty: 30, discountBp: 0 }],
          payments: [{ method: "cash", amount: 300000 }],
        },
      ],
    });

    expect(res1.results[0].status).toBe("created");

    const [updatedBatch] = await t.db
      .select({ qtyOnHand: schema.batches.qtyOnHand })
      .from(schema.batches)
      .where(eq(schema.batches.id, batch.id));
    expect(updatedBatch?.qtyOnHand).toBe(-10);

    const dedupeKey = `stock_conflict:${store.id}:${batch.id}`;
    const notifications = await t.db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.tenantId, tenant.id), eq(schema.notifications.dedupeKey, dedupeKey)));
    expect(notifications.length).toBe(1);
    expect(notifications[0].severity).toBe("warning");
    expect(notifications[0].body).toContain("dropped to -10");

    const clientSaleId2 = crypto.randomUUID();
    const invoiceNo2 = formatDeviceInvoiceNo({ storeCode: store.code, deviceCode: deviceCtx.code, fiscalYear: fy, sequence: 5 });

    await ingestOfflineSales(t.db, deviceCtx, {
      sales: [
        {
          clientSaleId: clientSaleId2,
          invoiceNo: invoiceNo2,
          fiscalYear: fy,
          sequenceNumber: 5,
          reservationId: reservation.reservationId,
          createdBy: user.id,
          completedAt: new Date().toISOString(),
          lines: [{ batchId: batch.id, medicineId: medicine.id, qty: 5, discountBp: 0 }],
          payments: [{ method: "cash", amount: 50000 }],
        },
      ],
    });

    const notificationsAfter = await t.db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.tenantId, tenant.id), eq(schema.notifications.dedupeKey, dedupeKey)));
    expect(notificationsAfter.length).toBe(1);
    expect(notificationsAfter[0].body).toContain("dropped to -15");
  });
});
