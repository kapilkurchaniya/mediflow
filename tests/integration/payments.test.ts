import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { seedSystemRoles } from "@/server/roles";
import { createTestDb } from "../setup/db";
import { makeCustomer, makeStore, makeSupplier, makeTenant, makeUser } from "../setup/factories";

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

import { getCustomersWithDue, getOpenBills, recordReceipt } from "@/app/actions/payments";
import { listCustomersWithDue, listOpenBills, postPayment, type PostPaymentInput } from "@/server/domain/payments";
import type { AuthCtx } from "@/server/rbac";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
afterAll(async () => {
  await t.cleanup();
});

const today = new Date().toISOString().slice(0, 10);

async function scene(roleKey = "owner") {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id);
  const user = await makeUser(t.db, { name: "Asha" });
  const roleIds = await seedSystemRoles(t.db, tenant.id);
  await t.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, roleId: roleIds[roleKey] });
  h.session = { tenantId: tenant.id, storeId: store.id };
  h.user = user;
  const ctx: AuthCtx = {
    tenantId: tenant.id,
    storeId: store.id,
    userId: user.id,
    user: { id: user.id, name: user.name, email: user.email, pharmacistRegNo: null },
    permissions: new Set(ALL_PERMISSIONS) as AuthCtx["permissions"],
    allowedStoreIds: "all",
  };
  const customer = await makeCustomer(t.db, tenant.id, { name: "Ravi" });
  let n = 0;
  const creditSale = async (credit: number, over: Partial<typeof schema.sales.$inferInsert> = {}) => {
    n += 1;
    const [s] = await t.db
      .insert(schema.sales)
      .values({
        tenantId: tenant.id, storeId: store.id, invoiceNo: `INV/26-27/00000${n}`, status: "completed", customerId: customer.id,
        totalAmount: credit, paidAmount: 0, creditAmount: credit, createdBy: user.id, completedAt: new Date(2026, 9, n), ...over,
      })
      .returning();
    return s;
  };
  const pay = (input: Partial<PostPaymentInput> & Pick<PostPaymentInput, "amount">, c: AuthCtx = ctx) =>
    t.db.transaction((tx) =>
      postPayment(tx, c, { direction: "in", partyType: "customer", partyId: customer.id, method: "cash", paymentDate: today, ...input } as PostPaymentInput),
    );
  const sale = async (id: string) => (await t.db.select().from(schema.sales).where(eq(schema.sales.id, id)))[0];
  const journal = async (paymentId: string) => {
    const lines = await t.db
      .select({ debit: schema.journalLines.debit, credit: schema.journalLines.credit, key: schema.accounts.systemKey, partyType: schema.journalLines.partyType })
      .from(schema.journalLines)
      .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
      .innerJoin(schema.accounts, eq(schema.journalLines.accountId, schema.accounts.id))
      .where(eq(schema.journalEntries.refId, paymentId));
    return lines;
  };
  return { tenant, store, user, ctx, customer, creditSale, pay, sale, journal };
}

describe("postPayment: a customer receipt", () => {
  it("settles part of a credit bill, posts a balanced journal and numbers the receipt", async () => {
    const s = await scene();
    const bill = await s.creditSale(80000);
    const res = await s.pay({ amount: 50000, allocations: [{ refType: "sale", refId: bill.id, amount: 50000 }], reference: "UTR1" });

    expect(res.paymentNo).toMatch(/^RCT\/\d{2}-\d{2}\/000001$/);
    expect(await s.sale(bill.id)).toMatchObject({ paidAmount: 50000, creditAmount: 30000 });

    const [p] = await t.db.select().from(schema.payments).where(eq(schema.payments.id, res.paymentId));
    expect(p).toMatchObject({ direction: "in", partyType: "customer", partyId: s.customer.id, method: "cash", amount: 50000, reference: "UTR1", paymentDate: today });
    expect(p.journalEntryId).toBeTruthy();

    const lines = await s.journal(res.paymentId);
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.key === "cash")).toMatchObject({ debit: 50000, credit: 0 });
    expect(lines.find((l) => l.key === "debtors")).toMatchObject({ debit: 0, credit: 50000, partyType: "customer" });

    const second = await s.pay({ amount: 30000, allocations: [{ refType: "sale", refId: bill.id, amount: 30000 }] });
    expect(second.paymentNo).toMatch(/000002$/);
    expect(await s.sale(bill.id)).toMatchObject({ paidAmount: 80000, creditAmount: 0 });
    expect(await listOpenBills(t.db, s.tenant.id, s.store.id, s.customer.id)).toHaveLength(0);
  });

  it("UPI, card and bank go to the bank account, cash to cash", async () => {
    const s = await scene();
    for (const [method, key] of [["upi", "bank"], ["card", "bank"], ["bank", "bank"], ["cash", "cash"]] as const) {
      const r = await s.pay({ amount: 1000, method });
      const debit = (await s.journal(r.paymentId)).find((l) => l.debit > 0)!;
      expect(debit.key).toBe(key);
    }
  });

  it("settles several bills at once and keeps the receipt total equal to the allocations", async () => {
    const s = await scene();
    const a = await s.creditSale(10000);
    const b = await s.creditSale(20000);
    await s.pay({ amount: 25000, allocations: [{ refType: "sale", refId: a.id, amount: 10000 }, { refType: "sale", refId: b.id, amount: 15000 }] });
    expect(await s.sale(a.id)).toMatchObject({ creditAmount: 0 });
    expect(await s.sale(b.id)).toMatchObject({ creditAmount: 5000, paidAmount: 15000 });
  });

  it("with no allocation the money stays on the customer's account (advance)", async () => {
    const s = await scene();
    const bill = await s.creditSale(10000);
    const r = await s.pay({ amount: 5000 });
    expect(await s.sale(bill.id)).toMatchObject({ creditAmount: 10000 });
    expect((await s.journal(r.paymentId)).find((l) => l.key === "debtors")).toMatchObject({ credit: 5000 });
  });

  it("an audit row is written", async () => {
    const s = await scene();
    const r = await s.pay({ amount: 1234 });
    const rows = await t.db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.tenantId, s.tenant.id), eq(schema.auditLogs.entityId, r.paymentId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "create", entityType: "payment" });
  });
});

describe("postPayment: refusals change nothing", () => {
  async function expectNothingChanged(s: Awaited<ReturnType<typeof scene>>) {
    expect(await t.db.select().from(schema.payments).where(eq(schema.payments.tenantId, s.tenant.id))).toHaveLength(0);
    expect(await t.db.select().from(schema.journalEntries).where(eq(schema.journalEntries.tenantId, s.tenant.id))).toHaveLength(0);
  }

  it("more than the bill's outstanding balance", async () => {
    const s = await scene();
    const bill = await s.creditSale(10000);
    await expect(s.pay({ amount: 20000, allocations: [{ refType: "sale", refId: bill.id, amount: 20000 }] })).rejects.toThrow(/only .*outstanding/);
    expect(await s.sale(bill.id)).toMatchObject({ creditAmount: 10000, paidAmount: 0 });
    await expectNothingChanged(s);
  });

  it("allocations above the amount paid, duplicate bills, wrong bill type, zero amounts", async () => {
    const s = await scene();
    const bill = await s.creditSale(10000);
    const alloc = (amount: number) => ({ refType: "sale" as const, refId: bill.id, amount });
    await expect(s.pay({ amount: 5000, allocations: [alloc(6000)] })).rejects.toThrow(/more than the/);
    await expect(s.pay({ amount: 9000, allocations: [alloc(1000), alloc(1000)] })).rejects.toThrow(/twice/);
    await expect(s.pay({ amount: 5000, allocations: [{ refType: "purchase", refId: bill.id, amount: 5000 }] })).rejects.toThrow(/can only settle sale bills/);
    await expect(s.pay({ amount: 0 })).rejects.toThrow(/more than zero/);
    await expectNothingChanged(s);
  });

  it("another customer's bill, another pharmacy's bill or customer", async () => {
    const mine = await scene();
    const other = await scene();
    const theirBill = await other.creditSale(10000);
    const otherCustomerBill = await mine.creditSale(10000, { customerId: (await makeCustomer(t.db, mine.tenant.id)).id });
    await expect(mine.pay({ amount: 100, allocations: [{ refType: "sale", refId: theirBill.id, amount: 100 }] }, mine.ctx)).rejects.toThrow(/does not belong/);
    await expect(mine.pay({ amount: 100, allocations: [{ refType: "sale", refId: otherCustomerBill.id, amount: 100 }] })).rejects.toThrow(/does not belong/);
    await expect(mine.pay({ amount: 100, partyId: other.customer.id })).rejects.toThrow(/Customer not found/);
    expect(await other.sale(theirBill.id)).toMatchObject({ creditAmount: 10000 });
  });

  it("a cancelled bill cannot be settled", async () => {
    const s = await scene();
    const bill = await s.creditSale(10000, { status: "cancelled" });
    await expect(s.pay({ amount: 100, allocations: [{ refType: "sale", refId: bill.id, amount: 100 }] })).rejects.toThrow(/does not belong/);
  });

  it("a future date, an impossible combination, a missing party", async () => {
    const s = await scene();
    await expect(s.pay({ amount: 100, paymentDate: "2999-01-01" })).rejects.toThrow(/future/);
    await expect(s.pay({ amount: 100, direction: "in", partyType: "supplier", partyId: s.customer.id })).rejects.toThrow(/receipt from a customer/);
    await expect(s.pay({ amount: 100, partyId: undefined })).rejects.toThrow(/Choose the customer/);
    await expectNothingChanged(s);
  });
});

describe("postPayment: paying suppliers and expenses (🤝 Lane B)", () => {
  async function withPurchase(s: Awaited<ReturnType<typeof scene>>, total: number) {
    const supplier = await makeSupplier(t.db, s.tenant.id, { name: "Acme Distributors" });
    const [p] = await t.db
      .insert(schema.purchases)
      .values({ tenantId: s.tenant.id, storeId: s.store.id, purchaseNo: "PUR/1", supplierId: supplier.id, supplierInvoiceNo: "SB-1", invoiceDate: today, totalAmount: total, paidAmount: 0, createdBy: s.user.id })
      .returning();
    return { supplier, purchase: p };
  }

  it("a supplier payment settles the purchase and debits the creditors account", async () => {
    const s = await scene();
    const { supplier, purchase } = await withPurchase(s, 600000);
    const r = await s.pay({ direction: "out", partyType: "supplier", partyId: supplier.id, amount: 500000, method: "bank", allocations: [{ refType: "purchase", refId: purchase.id, amount: 500000 }] });
    expect(r.paymentNo).toMatch(/^PAY\/\d{2}-\d{2}\/000001$/);
    const [p] = await t.db.select().from(schema.purchases).where(eq(schema.purchases.id, purchase.id));
    expect(p.paidAmount).toBe(500000);
    const lines = await s.journal(r.paymentId);
    expect(lines.find((l) => l.key === "creditors")).toMatchObject({ debit: 500000, credit: 0, partyType: "supplier" });
    expect(lines.find((l) => l.key === "bank")).toMatchObject({ debit: 0, credit: 500000 });
  });

  it("cannot pay more than is owed on the purchase", async () => {
    const s = await scene();
    const { supplier, purchase } = await withPurchase(s, 1000);
    await expect(
      s.pay({ direction: "out", partyType: "supplier", partyId: supplier.id, amount: 2000, allocations: [{ refType: "purchase", refId: purchase.id, amount: 2000 }] }),
    ).rejects.toThrow(/outstanding/);
  });

  it("an expense payment debits the expense account", async () => {
    const s = await scene();
    const [rent] = await t.db.insert(schema.accounts).values({ tenantId: s.tenant.id, code: "5010", name: "Rent", type: "expense" }).returning();
    const r = await s.pay({ direction: "out", partyType: "expense", partyId: undefined, expenseAccountId: rent.id, amount: 1000000 });
    const rows = await t.db
      .select({ debit: schema.journalLines.debit, credit: schema.journalLines.credit, name: schema.accounts.name })
      .from(schema.journalLines)
      .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
      .innerJoin(schema.accounts, eq(schema.journalLines.accountId, schema.accounts.id))
      .where(eq(schema.journalEntries.refId, r.paymentId));
    expect(rows.find((x) => x.name === "Rent")).toMatchObject({ debit: 1000000 });
    expect(rows.reduce((a, x) => a + Number(x.debit), 0)).toBe(rows.reduce((a, x) => a + Number(x.credit), 0));
    // an income/asset account is not a valid expense account
    const [cash] = await t.db.select().from(schema.accounts).where(and(eq(schema.accounts.tenantId, s.tenant.id), eq(schema.accounts.systemKey, "cash")));
    await expect(s.pay({ direction: "out", partyType: "expense", partyId: undefined, expenseAccountId: cash.id, amount: 100 })).rejects.toThrow(/Expense account not found/);
  });
});

describe("receipts: actions and lists", () => {
  it("lists customers with an unpaid balance and their open bills, oldest first", async () => {
    const s = await scene();
    await s.creditSale(10000);
    await s.creditSale(25000);
    const paid = await s.creditSale(5000, { creditAmount: 0, paidAmount: 5000 });
    expect(paid.creditAmount).toBe(0);
    expect(await listCustomersWithDue(t.db, s.tenant.id, s.store.id)).toMatchObject([{ id: s.customer.id, due: 35000, bills: 2 }]);
    const bills = await getOpenBills(s.customer.id);
    expect(bills.map((b) => b.due)).toEqual([10000, 25000]);
    expect(await getCustomersWithDue()).toHaveLength(1);
  });

  it("recordReceipt (accountant) saves a receipt and returns its number", async () => {
    const s = await scene("accountant");
    const bill = await s.creditSale(40000);
    const res = await recordReceipt({
      customerId: s.customer.id, method: "upi", paymentDate: today, reference: "UPI-9",
      bills: [{ saleId: bill.id, amount: 15000 }],
    });
    expect(res?.data?.paymentNo).toMatch(/^RCT\//);
    expect(await s.sale(bill.id)).toMatchObject({ paidAmount: 15000, creditAmount: 25000 });
  });

  it("recordReceipt shows a domain error as a message and validates the form", async () => {
    const s = await scene("accountant");
    const bill = await s.creditSale(1000);
    const over = await recordReceipt({ customerId: s.customer.id, method: "cash", paymentDate: today, bills: [{ saleId: bill.id, amount: 5000 }] });
    expect(over?.serverError).toMatch(/only .*outstanding/);
    const none = await recordReceipt({ customerId: s.customer.id, method: "cash", paymentDate: today, bills: [] });
    expect(none?.validationErrors).toBeTruthy();
  });

  it("only roles with accounting.post may record or see receipts", async () => {
    for (const role of ["owner", "manager", "accountant"]) {
      const s = await scene(role);
      await expect(getCustomersWithDue()).resolves.toEqual([]);
      expect(s).toBeTruthy();
    }
    for (const role of ["cashier", "pharmacist", "purchase_manager", "auditor"]) {
      const s = await scene(role);
      const bill = await s.creditSale(1000);
      await expect(getCustomersWithDue()).rejects.toThrow(/don't have permission/);
      const res = await recordReceipt({ customerId: s.customer.id, method: "cash", paymentDate: today, bills: [{ saleId: bill.id, amount: 500 }] });
      expect(res?.serverError).toMatch(/don't have permission/);
      expect(await s.sale(bill.id)).toMatchObject({ creditAmount: 1000 });
    }
  });
});
