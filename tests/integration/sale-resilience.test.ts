import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { seedSystemRoles } from "@/server/roles";
import { createTestDb } from "../setup/db";
import { makeBatch, makeCustomer, makeWorld } from "../setup/factories";

// ── Wire the real createSaleInvoice to the test database ─────────────────────────────────────────
const h = vi.hoisted(() => ({
  db: undefined as unknown,
  session: { tenantId: "", storeId: "" },
  user: undefined as unknown,
  failGst: false,
  failLoyalty: false,
}));

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
vi.mock("@/server/whatsapp", () => ({ sendWhatsAppReceipt: async () => {} }));

// A failing optional step must be a failing SQL statement: that is what aborts a Postgres transaction.
vi.mock("@/server/domain/gst", () => ({
  createGstDocumentFromSale: async (tx: { execute: (q: unknown) => Promise<unknown> }) => {
    if (h.failGst) await tx.execute(sql`select 1/0`);
  },
}));
vi.mock("@/server/domain/loyalty", () => ({
  LoyaltyService: {
    earnPoints: async (tx: { execute: (q: unknown) => Promise<unknown> }) => {
      if (h.failLoyalty) await tx.execute(sql`select 1/0`);
      return 0;
    },
  },
}));

import { createSaleInvoice } from "@/app/actions/sales";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
afterAll(async () => {
  await t.cleanup();
});
beforeEach(() => {
  h.failGst = false;
  h.failLoyalty = false;
});

async function scene(roleKey = "owner") {
  const w = await makeWorld(t.db);
  const roleIds = await seedSystemRoles(t.db, w.tenant.id);
  await t.db.insert(schema.memberships).values({ tenantId: w.tenant.id, userId: w.user.id, roleId: roleIds[roleKey] });
  const batch = await makeBatch(t.db, {
    tenantId: w.tenant.id, storeId: w.store.id, medicineId: w.medicine.id, qtyOnHand: 10, saleRate: 10000, mrp: 10000,
  });
  h.session = { tenantId: w.tenant.id, storeId: w.store.id };
  h.user = w.user;
  const items = [{ medicineId: w.medicine.id, batchId: batch.id, qty: 2, rate: 0, discountBp: 0 }];
  const stock = async () => (await t.db.select().from(schema.batches).where(eq(schema.batches.id, batch.id)))[0].qtyOnHand;
  const sales = async () => t.db.select().from(schema.sales).where(eq(schema.sales.tenantId, w.tenant.id));
  return { w, batch, items, stock, sales };
}

describe("createSaleInvoice", () => {
  it("baseline: a normal cash sale completes, decrements stock and posts a journal", async () => {
    const { w, items, stock, sales } = await scene();
    const res = await createSaleInvoice(undefined, "", items, "cash", 20000);
    expect(res).toMatchObject({ success: true });
    expect(await stock()).toBe(8);
    expect(await sales()).toHaveLength(1);
    const journal = await t.db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tenantId, w.tenant.id));
    expect(journal).toHaveLength(1);
  });

  it("a failing GST-document step does NOT take the sale down with it", async () => {
    const { items, stock, sales } = await scene();
    h.failGst = true;
    const res = await createSaleInvoice(undefined, "", items, "cash", 20000);
    expect(res).toMatchObject({ success: true });
    expect(await stock()).toBe(8);
    expect((await sales())[0]).toMatchObject({ status: "completed", totalAmount: 20000 });
  });

  it("a failing loyalty step does NOT take the sale down with it", async () => {
    const { w, items, stock, sales } = await scene();
    const customer = await makeCustomer(t.db, w.tenant.id);
    h.failLoyalty = true;
    const res = await createSaleInvoice(customer.id, "", items, "cash", 20000);
    expect(res).toMatchObject({ success: true });
    expect(await stock()).toBe(8);
    expect(await sales()).toHaveLength(1);
  });

  it("insufficient stock still fails cleanly and changes nothing", async () => {
    const { items, stock, sales } = await scene();
    const res = await createSaleInvoice(undefined, "", [{ ...items[0], qty: 50 }], "cash", 0);
    expect(res).toHaveProperty("error");
    expect(await stock()).toBe(10);
    expect(await sales()).toHaveLength(0);
  });
});

describe("createSaleInvoice: who may sell, and numbers from the browser are not trusted", () => {
  it("a cashier can bill", async () => {
    const { items, stock } = await scene("cashier");
    expect(await createSaleInvoice(undefined, "", items, "cash", 20000)).toMatchObject({ success: true });
    expect(await stock()).toBe(8);
  });

  it("a role without sale.create (auditor) is refused and nothing changes", async () => {
    const { items, stock, sales } = await scene("auditor");
    const res = await createSaleInvoice(undefined, "", items, "cash", 20000);
    expect(res).toMatchObject({ error: expect.stringMatching(/don't have permission.*sale\.create/) });
    expect(await stock()).toBe(10);
    expect(await sales()).toHaveLength(0);
  });

  it.each([
    ["negative discount (would add to the bill)", { discountBp: -500 }, "Discount must be between 0% and 100%."],
    ["discount above 100% (negative bill)", { discountBp: 10001 }, "Discount must be between 0% and 100%."],
    ["fractional discount", { discountBp: 12.5 }, "Discount must be between 0% and 100%."],
    ["zero quantity", { qty: 0 }, "Quantity must be a whole number above zero."],
    ["fractional quantity", { qty: 1.5 }, "Quantity must be a whole number above zero."],
    ["negative quantity", { qty: -2 }, "Quantity must be a whole number above zero."],
  ])("rejects %s", async (_name, patch, message) => {
    const { items, stock, sales } = await scene();
    expect(await createSaleInvoice(undefined, "", [{ ...items[0], ...patch }], "cash", 0)).toEqual({ error: message });
    expect(await stock()).toBe(10);
    expect(await sales()).toHaveLength(0);
  });

  it("rejects a negative amount paid", async () => {
    const { items, sales } = await scene();
    expect(await createSaleInvoice(undefined, "", items, "cash", -1)).toEqual({ error: "Amount paid must be zero or more." });
    expect(await sales()).toHaveLength(0);
  });

  describe("optional discount ceiling (tenants.settings.maxDiscountBp)", () => {
    const setLimit = (tenantId: string, bp: number) =>
      t.db.update(schema.tenants).set({ settings: { maxDiscountBp: bp } }).where(eq(schema.tenants.id, tenantId));

    it("a cashier cannot exceed it", async () => {
      const { w, items, stock } = await scene("cashier");
      await setLimit(w.tenant.id, 1000); // 10%
      const res = await createSaleInvoice(undefined, "", [{ ...items[0], discountBp: 1500 }], "cash", 20000);
      expect(res).toMatchObject({ error: expect.stringMatching(/above 10%.*sale\.discount_override/) });
      expect(await stock()).toBe(10);
    });

    it("a cashier can discount up to the ceiling", async () => {
      const { w, items } = await scene("cashier");
      await setLimit(w.tenant.id, 1000);
      expect(await createSaleInvoice(undefined, "", [{ ...items[0], discountBp: 1000 }], "cash", 18000)).toMatchObject({ success: true });
    });

    it("an owner (has sale.discount_override) can exceed it", async () => {
      const { w, items } = await scene("owner");
      await setLimit(w.tenant.id, 1000);
      expect(await createSaleInvoice(undefined, "", [{ ...items[0], discountBp: 1500 }], "cash", 17000)).toMatchObject({ success: true });
    });

    it("no ceiling configured = no limit (current behaviour is unchanged)", async () => {
      const { items } = await scene("cashier");
      expect(await createSaleInvoice(undefined, "", [{ ...items[0], discountBp: 5000 }], "cash", 10000)).toMatchObject({ success: true });
    });
  });
});
