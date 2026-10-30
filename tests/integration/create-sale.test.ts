import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { createTestDb } from "../setup/db";
import { makeBatch, makeCustomer, makeMedicine, makeStore, makeTenant, makeUser, makeWorld } from "../setup/factories";

vi.mock("@/server/auth", () => ({
  requireAuth: async () => {
    throw new Error("not used");
  },
  getCurrentSession: async () => null,
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createSale } from "@/server/domain/sales/create-sale";
import type { SaleInputData } from "@/server/domain/sales/types";
import { SaleInput } from "@/server/domain/sales/types";
import type { AuthCtx } from "@/server/rbac";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

type World = Awaited<ReturnType<typeof makeWorld>>;

function ctxFor(w: Pick<World, "tenant" | "store" | "user">, permissions: readonly string[] = ALL_PERMISSIONS): AuthCtx {
  return {
    tenantId: w.tenant.id,
    storeId: w.store.id,
    userId: w.user.id,
    user: { id: w.user.id, name: w.user.name, email: w.user.email, pharmacistRegNo: "PH-123" },
    permissions: new Set(permissions) as AuthCtx["permissions"],
    allowedStoreIds: "all",
  };
}

/** A tenant with one store and one medicine batch of 10 units at ₹100 (5% GST included). */
async function scene(opts: { storeState?: string; storeGstin?: string | null; schedule?: string } = {}) {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id, { stateCode: opts.storeState ?? "27", gstin: opts.storeGstin ?? null });
  const user = await makeUser(t.db);
  const maker = (await t.db.insert(schema.manufacturers).values({ tenantId: tenant.id, name: "Acme Pharma" }).returning())[0];
  const medicine = await makeMedicine(t.db, tenant.id, { schedule: opts.schedule ?? "none", manufacturerId: maker.id });
  const batch = await makeBatch(t.db, { tenantId: tenant.id, storeId: store.id, medicineId: medicine.id, qtyOnHand: 10 });
  const w = { tenant, store, user, medicine };
  const sell = (input: Partial<SaleInputData> = {}, over: { now?: Date; ctx?: AuthCtx; invoiceNo?: string } = {}) =>
    t.db.transaction((tx) =>
      createSale(
        tx,
        over.ctx ?? ctxFor(w),
        SaleInput.parse({ lines: [{ batchId: batch.id, qty: 2, discountBp: 0 }], payments: [{ method: "cash", amount: 20000 }], ...input }),
        { source: "pos", now: over.now, invoiceNo: over.invoiceNo },
      ),
    );
  const stock = async () => (await t.db.select().from(schema.batches).where(eq(schema.batches.id, batch.id)))[0].qtyOnHand;
  const sales = () => t.db.select().from(schema.sales).where(eq(schema.sales.tenantId, tenant.id));
  return { w, batch, sell, stock, sales };
}

describe("createSale: a full sale", () => {
  it("writes the sale, stock movement, journal, GST document and register, and queues the receipt", async () => {
    const s = await scene({ schedule: "H1" });
    const customer = await makeCustomer(t.db, s.w.tenant.id, { phone: "9876543210" });
    const res = await s.sell({
      customerId: customer.id,
      compliance: {
        doctorName: "Dr Verma",
        doctorRegNo: "MCI-1",
        patientName: "Ravi",
        patientAge: 40,
        patientGender: "male",
        patientAddress: "1 Main Road",
        prescriptionRef: "RX-1",
      },
    });

    expect(res).toMatchObject({ duplicate: false, total: 20000 });
    expect(res.invoiceNo).toMatch(/^INV\/\d{2}-\d{2}\/000001$/);
    expect(await s.stock()).toBe(8);

    const [sale] = await s.sales();
    expect(sale).toMatchObject({ status: "completed", totalAmount: 20000, paidAmount: 20000, creditAmount: 0, isInterState: false, customerPhone: "9876543210" });
    // ₹200 inclusive at 5% -> taxable ₹190.48, tax split evenly
    expect(sale.cgst).toBe(sale.sgst);
    expect(sale.igst).toBe(0);

    const moves = await t.db.select().from(schema.stockMovements).where(eq(schema.stockMovements.refId, sale.id));
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ type: "sale", qtyChange: -2, balanceAfter: 8 });

    const lines = await t.db
      .select({ debit: schema.journalLines.debit, credit: schema.journalLines.credit })
      .from(schema.journalLines)
      .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
      .where(eq(schema.journalEntries.refId, sale.id));
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.reduce((a, l) => a + Number(l.debit), 0)).toBe(lines.reduce((a, l) => a + Number(l.credit), 0));

    const docs = await t.db.select().from(schema.gstDocuments).where(eq(schema.gstDocuments.refId, sale.id));
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ total: 20000, docNo: res.invoiceNo });

    const [log] = await t.db.select().from(schema.dispensingLogs).where(eq(schema.dispensingLogs.saleId, sale.id));
    expect(log).toMatchObject({ patientName: "Ravi", doctorName: "Dr Verma", manufacturerName: "Acme Pharma", pharmacistRegNo: "PH-123", quantityDispensed: 2 });

    // the receipt is queued, not sent inside the request
    const events = await t.db.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.tenantId, s.w.tenant.id));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "whatsapp.receipt", status: "pending", payload: { saleId: sale.id } });
  });

  it("does not queue a receipt for a walk-in customer", async () => {
    const s = await scene();
    await s.sell();
    expect(await t.db.select().from(schema.outboxEvents).where(eq(schema.outboxEvents.tenantId, s.w.tenant.id))).toHaveLength(0);
  });

  it("ignores any price from the caller: the server rate is used", async () => {
    const s = await scene();
    const c = await makeCustomer(t.db, s.w.tenant.id, { creditLimit: 50000 });
    const res = await s.sell({ payments: [], customerId: c.id });
    expect(res.total).toBe(20000); // 2 x ₹100 (batch sale rate)
    const [sale] = await s.sales();
    expect(sale.creditAmount).toBe(20000); // nothing paid, all outstanding on credit
  });

  it("numbers by financial year and honours a pre-assigned invoice number", async () => {
    const s = await scene();
    const a = await s.sell({}, { now: new Date(2027, 2, 31, 12) }); // 31 Mar 2027 -> FY 26-27
    const b = await s.sell({}, { now: new Date(2027, 3, 1, 12) }); // 1 Apr 2027 -> FY 27-28, restarts
    expect(a.invoiceNo).toBe("INV/26-27/000001");
    expect(b.invoiceNo).toBe("INV/27-28/000001");
    const c = await s.sell({}, { invoiceNo: "D01/27-28/000007" });
    expect(c.invoiceNo).toBe("D01/27-28/000007");
  });
});

describe("createSale: idempotency", () => {
  it("a repeated clientSaleId returns the first sale and bills only once", async () => {
    const s = await scene();
    const clientSaleId = "22222222-2222-4222-8222-222222222222";
    const first = await s.sell({ clientSaleId });
    const second = await s.sell({ clientSaleId });
    expect(first.duplicate).toBe(false);
    expect(second).toMatchObject({ duplicate: true, saleId: first.saleId, invoiceNo: first.invoiceNo });
    expect(await s.stock()).toBe(8);
    expect(await s.sales()).toHaveLength(1);
  });

  it("two parallel requests with the same clientSaleId create exactly one sale", async () => {
    const s = await scene();
    const clientSaleId = "33333333-3333-4333-8333-333333333333";
    const results = await Promise.allSettled([s.sell({ clientSaleId }), s.sell({ clientSaleId })]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await s.sales()).toHaveLength(1);
    expect(await s.stock()).toBe(8);
  });
});

describe("createSale: tax context (CGST+SGST vs IGST)", () => {
  const MH_GSTIN = "27GSPTE0985F1Z5";
  const TN_GSTIN = "33AABCT1332L1ZL";

  it("B2B customer in another state -> IGST only, flagged inter-state", async () => {
    const s = await scene({ storeState: "27" });
    const c = await makeCustomer(t.db, s.w.tenant.id, { gstin: TN_GSTIN });
    await s.sell({ customerId: c.id });
    const [sale] = await s.sales();
    expect(sale).toMatchObject({ isInterState: true, cgst: 0, sgst: 0 });
    expect(sale.igst).toBeGreaterThan(0);
  });

  it("B2B customer in the same state -> CGST + SGST", async () => {
    const s = await scene({ storeState: "27" });
    const c = await makeCustomer(t.db, s.w.tenant.id, { gstin: MH_GSTIN });
    await s.sell({ customerId: c.id });
    const [sale] = await s.sales();
    expect(sale).toMatchObject({ isInterState: false, igst: 0 });
    expect(sale.cgst).toBeGreaterThan(0);
  });

  it("a customer without a GSTIN is always intra-state", async () => {
    const s = await scene({ storeState: "27" });
    const c = await makeCustomer(t.db, s.w.tenant.id, { stateCode: "33" });
    await s.sell({ customerId: c.id });
    expect((await s.sales())[0].isInterState).toBe(false);
  });

  it("a store whose state is not a 2-digit code (seed data 'MH') and has no GSTIN bills intra-state instead of guessing", async () => {
    const s = await scene({ storeState: "MH" });
    const c = await makeCustomer(t.db, s.w.tenant.id, { gstin: TN_GSTIN });
    await s.sell({ customerId: c.id });
    expect((await s.sales())[0]).toMatchObject({ isInterState: false, igst: 0 });
  });

  it("a non-numeric store state falls back to the store's GSTIN", async () => {
    const s = await scene({ storeState: "MH", storeGstin: MH_GSTIN });
    const c = await makeCustomer(t.db, s.w.tenant.id, { gstin: TN_GSTIN });
    await s.sell({ customerId: c.id });
    expect((await s.sales())[0].isInterState).toBe(true);
  });
});

describe("createSale: prescriptions (🤝 B1.4)", () => {
  async function withRx(qtyPrescribed: number, validUntil?: string) {
    const s = await scene({ schedule: "H1" });
    const [rx] = await t.db
      .insert(schema.prescriptions)
      .values({
        tenantId: s.w.tenant.id,
        storeId: s.w.store.id,
        patientName: "Ravi",
        doctorName: "Dr Verma",
        prescriptionDate: "2026-10-01",
        validUntil: validUntil ?? null,
      })
      .returning();
    await t.db.insert(schema.prescriptionItems).values({
      tenantId: s.w.tenant.id,
      prescriptionId: rx.id,
      medicineId: s.w.medicine.id,
      medicineName: s.w.medicine.name,
      quantityPrescribed: qtyPrescribed,
    });
    const compliance = {
      doctorName: "Dr Verma",
      doctorRegNo: "MCI-1",
      patientName: "Ravi",
      patientAge: 40,
      patientAddress: "1 Main Road",
      prescriptionRef: "RX-1",
      prescriptionId: rx.id,
    };
    const rxState = async () => ({
      rx: (await t.db.select().from(schema.prescriptions).where(eq(schema.prescriptions.id, rx.id)))[0],
      item: (await t.db.select().from(schema.prescriptionItems).where(eq(schema.prescriptionItems.prescriptionId, rx.id)))[0],
    });
    return { ...s, compliance, rxState };
  }

  it("selling against a prescription advances its dispensed quantity and status", async () => {
    const s = await withRx(3);
    await s.sell({ compliance: s.compliance });
    let st = await s.rxState();
    expect(st.item.quantityDispensed).toBe(2);
    expect(st.rx.status).toBe("partially_dispensed");
    await s.sell({ compliance: s.compliance, lines: [{ batchId: s.batch.id, qty: 1, discountBp: 0 }], payments: [{ method: "cash", amount: 10000 }] });
    st = await s.rxState();
    expect(st.item.quantityDispensed).toBe(3);
    expect(st.rx.status).toBe("fully_dispensed");
  });

  it("over-dispensing an H1 drug is refused and nothing is written", async () => {
    const s = await withRx(3);
    await s.sell({ compliance: s.compliance }); // 2 of 3
    await expect(s.sell({ compliance: s.compliance })).rejects.toThrow(/Excess dispensing prohibited/); // +2 > 3
    expect(await s.stock()).toBe(8);
    expect(await s.sales()).toHaveLength(1);
    expect((await s.rxState()).item.quantityDispensed).toBe(2);
  });

  it("an expired prescription is refused", async () => {
    const s = await withRx(3, "2020-01-01");
    await expect(s.sell({ compliance: s.compliance })).rejects.toThrow(/expired/i);
    expect(await s.sales()).toHaveLength(0);
  });
});

describe("createSale: refusals change nothing", () => {
  it("insufficient stock", async () => {
    const s = await scene();
    await expect(s.sell({ lines: [{ batchId: s.batch.id, qty: 50, discountBp: 0 }] })).rejects.toThrow(/Insufficient stock/);
    expect(await s.stock()).toBe(10);
    expect(await s.sales()).toHaveLength(0);
  });

  it("an expired batch", async () => {
    const s = await scene();
    await t.db.update(schema.batches).set({ expiryDate: "2020-01-01" }).where(eq(schema.batches.id, s.batch.id));
    await expect(s.sell()).rejects.toThrow(/expired/);
    expect(await s.stock()).toBe(10);
  });

  it("a batch of another pharmacy", async () => {
    const mine = await scene();
    const other = await scene();
    await expect(
      mine.sell({ lines: [{ batchId: other.batch.id, qty: 1, discountBp: 0 }] }),
    ).rejects.toThrow(/not found/);
    expect(await other.stock()).toBe(10);
  });

  it("a customer of another pharmacy", async () => {
    const mine = await scene();
    const other = await scene();
    const foreign = await makeCustomer(t.db, other.w.tenant.id);
    await expect(mine.sell({ customerId: foreign.id })).rejects.toThrow(/Customer not found/);
    expect(await mine.sales()).toHaveLength(0);
  });

  it("a Schedule H1 drug without doctor details", async () => {
    const s = await scene({ schedule: "H1" });
    await expect(s.sell()).rejects.toThrow(/required|mandatory/i);
    expect(await s.stock()).toBe(10);
  });

  it("loyalty point redemption is not available yet, and 'credit' is not a payment method", async () => {
    const s = await scene();
    await expect(s.sell({ redeemPoints: 5 })).rejects.toThrow(/not available yet/);
    await expect(s.sell({ payments: [{ method: "credit", amount: 10000 }] })).rejects.toThrow(/Leave the unpaid part empty/);
    expect(await s.sales()).toHaveLength(0);
  });

  it("the discount ceiling needs sale.discount_override", async () => {
    const s = await scene();
    await t.db.update(schema.tenants).set({ settings: { maxDiscountBp: 1000 } }).where(eq(schema.tenants.id, s.w.tenant.id));
    const cashier = ctxFor(s.w, ["sale.create"]);
    await expect(
      s.sell({ lines: [{ batchId: s.batch.id, qty: 1, discountBp: 1500 }] }, { ctx: cashier }),
    ).rejects.toThrow(/need a manager's approval/);
    await s.sell({ lines: [{ batchId: s.batch.id, qty: 1, discountBp: 1000 }] }, { ctx: cashier }); // at the limit is fine
    await s.sell({ lines: [{ batchId: s.batch.id, qty: 1, discountBp: 1500 }] }); // owner may override
    expect(await s.sales()).toHaveLength(2);
  });

  it("negative or fractional numbers", async () => {
    const s = await scene();
    const bad = (line: object) => s.sell({ lines: [{ batchId: s.batch.id, qty: 1, discountBp: 0, ...line }] });
    // Zod rejects these before the service; the service also guards by itself when called directly.
    await expect(bad({ qty: 0 })).rejects.toThrow();
    await expect(
      t.db.transaction((tx) =>
        createSale(tx, ctxFor(s.w), { lines: [{ batchId: s.batch.id, qty: -1, discountBp: 0 }], billDiscountPaise: 0, payments: [], redeemPoints: 0 }, { source: "pos" }),
      ),
    ).rejects.toThrow(/Quantity must be a whole number/);
    expect(await s.stock()).toBe(10);
  });
});

describe("createSale: optional steps never lose the sale", () => {
  it("a failing outbox insert is swallowed (savepoint) and the sale is kept", async () => {
    const s = await scene();
    const customer = await makeCustomer(t.db, s.w.tenant.id, { phone: "9876543210" });
    // Make the outbox insert fail for real: a CHECK that rejects whatsapp.receipt rows.
    await t.db.execute(sql`alter table outbox_events add constraint tmp_no_receipt check (type <> 'whatsapp.receipt') not valid`);
    try {
      const res = await s.sell({ customerId: customer.id });
      expect(res.total).toBe(20000);
      expect(await s.stock()).toBe(8);
      expect(await s.sales()).toHaveLength(1);
    } finally {
      await t.db.execute(sql`alter table outbox_events drop constraint tmp_no_receipt`);
    }
  });
});

describe("createSale: split tender, change and credit (A2.2)", () => {
  async function journalDebits(saleId: string) {
    const rows = await t.db
      .select({ key: schema.accounts.systemKey, debit: schema.journalLines.debit, credit: schema.journalLines.credit, partyId: schema.journalLines.partyId })
      .from(schema.journalLines)
      .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
      .innerJoin(schema.accounts, eq(schema.journalLines.accountId, schema.accounts.id))
      .where(eq(schema.journalEntries.refId, saleId));
    expect(rows.reduce((a, r) => a + Number(r.debit), 0), "journal must balance").toBe(rows.reduce((a, r) => a + Number(r.credit), 0));
    return rows;
  }
  const payments = (saleId: string) => t.db.select().from(schema.salePayments).where(eq(schema.salePayments.saleId, saleId));
  const sale = async (id: string) => (await t.db.select().from(schema.sales).where(eq(schema.sales.id, id)))[0];

  it("₹300 cash + ₹200 UPI on a ₹500 bill: two payment rows and a balanced journal on two accounts", async () => {
    const s = await scene();
    // 5 units x ₹100 = ₹500
    const res = await s.sell({ lines: [{ batchId: s.batch.id, qty: 5, discountBp: 0 }], payments: [{ method: "cash", amount: 30000 }, { method: "upi", amount: 20000, reference: "UTR1" }] });
    expect(res).toMatchObject({ total: 50000, changeDue: 0 });
    const rows = await payments(res.saleId);
    expect(rows.map((r) => [r.method, r.amount]).sort()).toEqual([["cash", 30000], ["upi", 20000]]);
    expect(rows.find((r) => r.method === "upi")!.reference).toBe("UTR1");
    expect(await sale(res.saleId)).toMatchObject({ paidAmount: 50000, creditAmount: 0 });
    const debits = (await journalDebits(res.saleId)).filter((r) => r.debit > 0);
    expect(debits.find((r) => r.key === "cash")!.debit).toBe(30000);
    expect(debits.find((r) => r.key === "bank")!.debit).toBe(20000);
  });

  it("card and bank go to the bank account; two UPI rows add up on one journal line", async () => {
    const s = await scene();
    const res = await s.sell({ payments: [{ method: "upi", amount: 5000 }, { method: "card", amount: 5000 }, { method: "bank", amount: 10000 }] });
    const bank = (await journalDebits(res.saleId)).filter((r) => r.key === "bank" && r.debit > 0);
    expect(bank).toHaveLength(1);
    expect(bank[0].debit).toBe(20000);
  });

  it("paying too much in cash gives change; the shop keeps exactly the bill", async () => {
    const s = await scene();
    const res = await s.sell({ payments: [{ method: "cash", amount: 50000 }] }); // ₹500 for a ₹200 bill
    expect(res).toMatchObject({ total: 20000, changeDue: 30000 });
    expect(await sale(res.saleId)).toMatchObject({ paidAmount: 20000, creditAmount: 0 });
    expect((await payments(res.saleId)).map((r) => [r.method, r.amount])).toEqual([["cash", 20000]]);
    expect((await journalDebits(res.saleId)).find((r) => r.key === "cash")!.debit).toBe(20000);
  });

  it("overpaying with UPI or card is refused; overpaying across cash + UPI is fine when cash covers it", async () => {
    const s = await scene();
    await expect(s.sell({ payments: [{ method: "upi", amount: 25000 }] })).rejects.toThrow(/Only cash can be overpaid/);
    await expect(s.sell({ payments: [{ method: "cash", amount: 1000 }, { method: "upi", amount: 25000 }] })).rejects.toThrow(/Only cash can be overpaid/);
    expect(await s.sales()).toHaveLength(0);
    const ok = await s.sell({ payments: [{ method: "cash", amount: 5000 }, { method: "upi", amount: 20000 }] }); // ₹250 for ₹200: ₹50 change
    expect(ok.changeDue).toBe(5000);
    expect((await payments(ok.saleId)).map((r) => [r.method, r.amount])).toEqual([["upi", 20000]]); // the cash row was all change
  });

  describe("credit", () => {
    it("the unpaid part goes on the customer's account (debtors, with the customer as party)", async () => {
      const s = await scene();
      const c = await makeCustomer(t.db, s.w.tenant.id, { creditLimit: 100000 });
      const res = await s.sell({ customerId: c.id, payments: [{ method: "cash", amount: 5000 }] }); // ₹50 of ₹200 paid
      expect(await sale(res.saleId)).toMatchObject({ paidAmount: 5000, creditAmount: 15000 });
      const debtors = (await journalDebits(res.saleId)).find((r) => r.key === "debtors")!;
      expect(debtors).toMatchObject({ debit: 15000, partyId: c.id });
    });

    it("needs a customer", async () => {
      const s = await scene();
      await expect(s.sell({ payments: [{ method: "cash", amount: 5000 }] })).rejects.toThrow(/Choose a customer/);
      expect(await s.sales()).toHaveLength(0);
    });

    it("needs the customer.credit permission", async () => {
      const s = await scene();
      const c = await makeCustomer(t.db, s.w.tenant.id, { creditLimit: 100000 });
      const noCredit = ctxFor(s.w, ["sale.create"]);
      await expect(s.sell({ customerId: c.id, payments: [] }, { ctx: noCredit })).rejects.toThrow(/permission to sell on credit/);
      // paying in full needs no credit permission
      await s.sell({ customerId: c.id }, { ctx: noCredit });
    });

    it("a customer with no credit limit (0) cannot buy on credit", async () => {
      const s = await scene();
      const c = await makeCustomer(t.db, s.w.tenant.id, { creditLimit: 0 });
      await expect(s.sell({ customerId: c.id, payments: [] })).rejects.toThrow(/no credit limit/);
    });

    it("stops at the credit limit, counting what the customer already owes (cancelled bills do not count)", async () => {
      const s = await scene();
      const c = await makeCustomer(t.db, s.w.tenant.id, { creditLimit: 30000 }); // ₹300
      await s.sell({ customerId: c.id, payments: [] }); // owes ₹200
      await expect(s.sell({ customerId: c.id, payments: [] })).rejects.toThrow(/Credit limit exceeded: .*already owes ₹200\.00 and the limit is ₹300\.00/);
      // paying ₹150 of the next ₹200 bill puts only ₹50 on credit: ₹250 total, within ₹300
      await s.sell({ customerId: c.id, payments: [{ method: "cash", amount: 15000 }] });
      await expect(s.sell({ customerId: c.id, payments: [] })).rejects.toThrow(/Credit limit exceeded/);
      // cancelled bills no longer count
      await t.db.update(schema.sales).set({ status: "cancelled" }).where(eq(schema.sales.customerId, c.id));
      await s.sell({ customerId: c.id, payments: [] });
      expect((await s.sales()).filter((x) => x.status === "completed")).toHaveLength(1);
    });

    it("serializes concurrent credit sales against the same customer and enforces credit limit", async () => {
      const s = await scene();
      const c = await makeCustomer(t.db, s.w.tenant.id, { creditLimit: 30000 }); // ₹300 limit
      // Each sale is ₹200. Two concurrent credit sales would total ₹400 (> ₹300).
      // Because customer is locked for update, one must succeed and one must fail with CREDIT_LIMIT.
      const p1 = s.sell({ customerId: c.id, payments: [] });
      const p2 = s.sell({ customerId: c.id, payments: [] });
      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      if (rejected[0].status === "rejected") {
        expect((rejected[0].reason as Error).message).toMatch(/Credit limit exceeded/);
      }
    });
  });

  it("the replay of an idempotent sale reports the same change", async () => {
    const s = await scene();
    const clientSaleId = "44444444-4444-4444-8444-444444444444";
    const first = await s.sell({ clientSaleId, payments: [{ method: "cash", amount: 50000 }] });
    const again = await s.sell({ clientSaleId, payments: [{ method: "cash", amount: 50000 }] });
    expect(first.changeDue).toBe(30000);
    expect(again).toMatchObject({ duplicate: true, changeDue: 30000 });
  });
});
