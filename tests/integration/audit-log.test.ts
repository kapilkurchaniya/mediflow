import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { seedSystemRoles } from "@/server/roles";
import { createTestDb } from "../setup/db";
import { makeBatch, makeStore, makeTenant, makeUser, makeMedicine } from "../setup/factories";

const h = vi.hoisted(() => ({ db: undefined as unknown, session: { tenantId: "", storeId: "" }, user: undefined as unknown }));
vi.mock("@/server/db", async () => ({
  get db() {
    return h.db;
  },
  schema: await import("@/server/db/schema"),
}));
vi.mock("@/server/auth", () => ({
  requireAuth: async () => ({ session: h.session, user: h.user }),
  getCurrentSession: async () => ({ session: h.session, user: h.user }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getAuditFilterOptions, getAuditLogs } from "@/app/actions/audit";
import { createMedicine } from "@/app/actions/inventory";
import { createSaleInvoice } from "@/app/actions/sales";
import { updateStoreSettings } from "@/app/actions/settings";
import { addOpeningStock, adjustBatchStock } from "@/app/actions/stock";
import { queryAuditLogs } from "@/server/domain/audit-log";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
afterAll(async () => {
  await t.cleanup();
});

const form = (fields: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

async function scene(roleKey = "owner") {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id, { name: "Old Name", gstin: null, invoicePrefix: "INV" });
  const user = await makeUser(t.db, { name: "Asha" });
  const roleIds = await seedSystemRoles(t.db, tenant.id);
  await t.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, roleId: roleIds[roleKey] });
  const medicine = await makeMedicine(t.db, tenant.id);
  const batch = await makeBatch(t.db, { tenantId: tenant.id, storeId: store.id, medicineId: medicine.id, qtyOnHand: 10 });
  h.session = { tenantId: tenant.id, storeId: store.id };
  h.user = user;
  const audit = (f = {}) => queryAuditLogs(t.db, tenant.id, f);
  return { tenant, store, user, medicine, batch, roleIds, audit };
}

describe("audit rows are written by the actions", () => {
  it("adjusting stock records the old and new quantity and the reason", async () => {
    const s = await scene();
    const res = await adjustBatchStock(form({ batchId: s.batch.id, qtyChange: "-3", reason: "damage", note: "Water leak" }));
    expect(res).toEqual({ success: true });
    const { rows } = await s.audit();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "stock_adjust",
      entityType: "batch",
      entityId: s.batch.id,
      userName: "Asha",
      oldValue: { qtyOnHand: 10 },
      newValue: { qtyOnHand: 7 },
      reason: "damage: Water leak",
    });
  });

  it("a failed adjustment (more than on hand) leaves no audit row and no stock change", async () => {
    const s = await scene();
    const res = await adjustBatchStock(form({ batchId: s.batch.id, qtyChange: "-30", reason: "damage" }));
    expect(res).toHaveProperty("error");
    expect((await s.audit()).total).toBe(0);
    const [b] = await t.db.select().from(schema.batches).where(eq(schema.batches.id, s.batch.id));
    expect(b.qtyOnHand).toBe(10);
  });

  it("opening stock records the quantity before and after", async () => {
    const s = await scene();
    const res = await addOpeningStock(
      form({ medicineId: s.medicine.id, batchNo: "NEW1", expiryDate: "2099-01-01", qty: "25", purchaseRate: "60", mrp: "100" }),
    );
    expect(res).toEqual({ success: true });
    const { rows } = await s.audit();
    expect(rows[0]).toMatchObject({ action: "stock_adjust", reason: "Opening stock entry", oldValue: { qtyOnHand: 0 }, newValue: { qtyOnHand: 25, batchNo: "NEW1" } });
  });

  it("changing the store profile records only the fields that changed", async () => {
    const s = await scene();
    const res = await updateStoreSettings(
      form({ name: "New Name", stateCode: "27", invoicePrefix: "NEW", address: "", city: "", pincode: "", phone: "", gstin: "", drugLicenseNo: "" }),
    );
    expect(res).toEqual({ success: true });
    const { rows } = await s.audit();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "update", entityType: "store", entityId: s.store.id });
    expect(rows[0].oldValue).toMatchObject({ name: "Old Name", invoicePrefix: "INV" });
    expect(rows[0].newValue).toMatchObject({ name: "New Name", invoicePrefix: "NEW" });
    expect(Object.keys(rows[0].newValue as object).sort()).toEqual(["invoicePrefix", "name"]);
  });

  it("saving the profile without changing anything writes no audit row", async () => {
    const s = await scene();
    await updateStoreSettings(form({ name: "Old Name", stateCode: s.store.stateCode, invoicePrefix: "INV", address: "", city: "", pincode: "", phone: "", gstin: "", drugLicenseNo: "" }));
    expect((await s.audit()).total).toBe(0);
  });

  it("creating a medicine records its price, GST rate and schedule", async () => {
    const s = await scene();
    const res = await createMedicine(form({ name: "Azee 500", mrp: "210", salePrice: "210", gstRateBp: "5", schedule: "H1", hsn: "30049099" }));
    expect(res).toEqual({ success: true });
    const { rows } = await s.audit();
    expect(rows[0]).toMatchObject({ action: "create", entityType: "medicine" });
    expect(rows[0].newValue).toMatchObject({ name: "Azee 500", mrp: 21000, gstRateBp: 500, schedule: "H1" });
  });

  it("a discount above the shop limit, allowed by sale.discount_override, leaves a trail; one within it does not", async () => {
    const s = await scene("owner");
    await t.db.update(schema.tenants).set({ settings: { maxDiscountBp: 1000 } }).where(eq(schema.tenants.id, s.tenant.id));
    const item = (discountBp: number) => [{ medicineId: s.medicine.id, batchId: s.batch.id, qty: 1, rate: 0, discountBp }];
    expect(await createSaleInvoice(undefined, "", item(1000), "cash", 20000)).toMatchObject({ success: true });
    expect((await s.audit({ action: "discount_override" })).total).toBe(0);
    const res = await createSaleInvoice(undefined, "", item(1500), "cash", 20000);
    expect(res).toMatchObject({ success: true });
    const { rows } = await s.audit({ action: "discount_override" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entityType: "sale", entityId: (res as { saleId: string }).saleId });
    expect(rows[0].newValue).toMatchObject({ maxDiscountBp: 1000, highestLineDiscountBp: 1500 });
  });
});

describe("reading the audit log", () => {
  async function seedRows(tenantId: string, userId: string) {
    const mk = (createdAt: string, action: string, entityType: string, uid: string | null = userId) =>
      ({ tenantId, userId: uid, action, entityType, createdAt: new Date(createdAt) });
    await t.db.insert(schema.auditLogs).values([
      mk("2026-01-10T10:00:00", "update", "store"),
      mk("2026-02-10T10:00:00", "stock_adjust", "batch"),
      mk("2026-02-11T10:00:00", "create", "medicine"),
      mk("2026-03-01T10:00:00", "update", "store", null),
      mk("2026-03-02T10:00:00", "update", "store"),
    ]);
  }

  it("filters by user, record type, action and date, newest first", async () => {
    const s = await scene();
    await seedRows(s.tenant.id, s.user.id);
    expect((await s.audit()).rows.map((r) => r.createdAt.getMonth())).toEqual([2, 2, 1, 1, 0]); // newest first
    expect((await s.audit({ entityType: "store" })).total).toBe(3);
    expect((await s.audit({ action: "create" })).total).toBe(1);
    expect((await s.audit({ userId: s.user.id })).total).toBe(4); // one system row has no user
    expect((await s.audit({ from: "2026-02-01", to: "2026-02-28" })).total).toBe(2);
    expect((await s.audit({ from: "2026-02-11", to: "2026-02-11" })).total).toBe(1); // inclusive day
    expect((await s.audit({ entityType: "store", from: "2026-03-01" })).total).toBe(2);
  });

  it("pages the results", async () => {
    const s = await scene();
    await seedRows(s.tenant.id, s.user.id);
    const p1 = await s.audit({ pageSize: 2, page: 1 });
    const p3 = await s.audit({ pageSize: 2, page: 3 });
    expect(p1).toMatchObject({ total: 5, page: 1, pageSize: 2 });
    expect(p1.rows).toHaveLength(2);
    expect(p3.rows).toHaveLength(1);
  });

  it("never shows another pharmacy's entries", async () => {
    const a = await scene();
    const b = await scene();
    await seedRows(a.tenant.id, a.user.id);
    await seedRows(b.tenant.id, b.user.id);
    h.session = { tenantId: a.tenant.id, storeId: a.store.id };
    h.user = a.user;
    const mine = await getAuditLogs({ pageSize: 200 });
    expect(mine.total).toBe(5);
    expect(mine.rows.every((r) => r.userId === a.user.id || r.userId === null)).toBe(true);
    const opts = await getAuditFilterOptions();
    expect(opts.users.map((u) => u.id)).toEqual([a.user.id]);
    expect(opts.entityTypes).toEqual(["batch", "medicine", "store"]);
  });

  it("owner, manager and auditor may read it; cashier and pharmacist may not", async () => {
    for (const role of ["owner", "manager", "auditor"]) {
      await scene(role);
      await expect(getAuditLogs()).resolves.toMatchObject({ rows: expect.any(Array) });
    }
    for (const role of ["cashier", "pharmacist", "accountant", "purchase_manager"]) {
      await scene(role);
      await expect(getAuditLogs()).rejects.toThrow(/don't have permission/);
    }
  });

  it("is append-only: the app has no way to edit or delete a row", async () => {
    // there is no update/delete action; this documents that the only writer is writeAudit (insert)
    const s = await scene();
    await adjustBatchStock(form({ batchId: s.batch.id, qtyChange: "-1", reason: "damage" }));
    const rows = await t.db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.tenantId, s.tenant.id)));
    expect(rows).toHaveLength(1);
  });
});
