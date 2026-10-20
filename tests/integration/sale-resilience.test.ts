import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { createTestDb } from "../setup/db";
import { makeBatch, makeCustomer, makeWorld } from "../setup/factories";

// ── Wire the real createSaleInvoice to the test database ─────────────────────────────────────────
const h = vi.hoisted(() => ({
  db: undefined as unknown,
  session: { tenantId: "", storeId: "" },
  user: { id: "", name: "Test Pharmacist", pharmacistRegNo: "PH-1" },
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

async function scene() {
  const w = await makeWorld(t.db);
  const batch = await makeBatch(t.db, {
    tenantId: w.tenant.id, storeId: w.store.id, medicineId: w.medicine.id, qtyOnHand: 10, saleRate: 10000, mrp: 10000,
  });
  h.session = { tenantId: w.tenant.id, storeId: w.store.id };
  h.user = { ...h.user, id: w.user.id };
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
