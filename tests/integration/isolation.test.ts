import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/server/db/schema";
import { seedSystemRoles } from "@/server/roles";
import { createTestDb } from "../setup/db";
import { makeBatch, makeCustomer, makeMedicine, makeStore, makeSupplier, makeTenant, makeUser } from "../setup/factories";

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
vi.mock("@/server/whatsapp", () => ({ sendWhatsAppReceipt: async () => {} }));

import { getAccounts, getJournalLines, getTrialBalance } from "@/app/actions/accounting";
import { getBankStatements, getStatementLines, runAutoMatch, unmatchLine } from "@/app/actions/bank-reconciliation";
import { addCustomerToGroup, getCustomerGroups, getFamilyGroupDetails } from "@/app/actions/customer-groups";
import { getCustomers, updateCustomer } from "@/app/actions/customers";
import { getDashboardStats } from "@/app/actions/dashboard";
import { getExternalOrders, getOrderById, updateOrderStatus } from "@/app/actions/external-orders";
import { cancelEInvoiceAction, generateEInvoiceAction, getGstDashboard, getOutwardSupplies } from "@/app/actions/gst";
import { createMedicine, getCategories, getManufacturers, getMedicines } from "@/app/actions/inventory";
import { adjustCustomerLoyalty, getCustomerLoyalty } from "@/app/actions/loyalty";
import { getMedicalReps, toggleMedicalRepStatus } from "@/app/actions/medical-reps";
import { getPromiseOrders, updatePromiseOrderStatus } from "@/app/actions/promise-orders";
import { getPurchaseById, getPurchases } from "@/app/actions/purchases";
import { assignMedicineToRack, deleteRack, getRacks, updateRack } from "@/app/actions/racks";
import { cancelReminder, getReminders } from "@/app/actions/reminders";
import { getSaleById, getSales, searchPosItems } from "@/app/actions/sales";
import { deleteScheme, getSchemes, toggleSchemeStatus } from "@/app/actions/schemes";
import { getSmsConfig } from "@/app/actions/sms";
import { addOpeningStock, adjustBatchStock, getBatches } from "@/app/actions/stock";
import { getSupplierById, getSuppliers, updateSupplier } from "@/app/actions/suppliers";
import { getWhatsAppConfig, getWhatsAppMessages, getWhatsAppTemplates } from "@/app/actions/whatsapp";
import { cancelPrescription, getDoctors, getPrescriptionDetails, getPrescriptions } from "@/app/actions/compliance";
import { listApiKeys, revokeApiKey } from "@/app/actions/api-keys";

/**
 * ROADMAP A1.7: tenant isolation. Pharmacy B is signed in as an OWNER (every permission), so a refusal can only
 * come from isolation, not from missing rights. B reads and writes with pharmacy A's ids and must get nothing,
 * change nothing. (The permission side, "a user without the right is refused", is in lane-a- and
 * lane-b-permissions.test.ts and tests/unit/action-guards.test.ts.)
 */
const MARK = "ZZISOLATIONA";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
afterAll(async () => {
  await t.cleanup();
});

type Side = Awaited<ReturnType<typeof makeSide>>;

async function makeSide(label: string) {
  const tenant = await makeTenant(t.db, { name: `${MARK}-${label}` });
  const store = await makeStore(t.db, tenant.id);
  const user = await makeUser(t.db, { name: `${label} owner` });
  const roleIds = await seedSystemRoles(t.db, tenant.id);
  await t.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, roleId: roleIds.owner });
  return { tenant, store, user };
}
const signInAs = (s: Pick<Side, "tenant" | "store" | "user">) => {
  h.session = { tenantId: s.tenant.id, storeId: s.store.id };
  h.user = s.user;
};

/** Everything pharmacy A owns, each row tagged with MARK in its name where a name exists. */
async function seedVictim() {
  const s = await makeSide("A");
  const tid = s.tenant.id;
  const [maker] = await t.db.insert(schema.manufacturers).values({ tenantId: tid, name: `${MARK} Pharma` }).returning();
  const [cat] = await t.db.insert(schema.categories).values({ tenantId: tid, name: `${MARK} Category` }).returning();
  const [rack] = await t.db.insert(schema.racks).values({ tenantId: tid, storeId: s.store.id, code: "A-1", name: `${MARK} Rack` }).returning();
  const medicine = await makeMedicine(t.db, tid, { name: `${MARK} Medicine`, manufacturerId: maker.id, categoryId: cat.id, rackId: rack.id });
  const batch = await makeBatch(t.db, { tenantId: tid, storeId: s.store.id, medicineId: medicine.id, qtyOnHand: 10, batchNo: `${MARK}-B1` });
  const customer = await makeCustomer(t.db, tid, { name: `${MARK} Customer`, phone: "9000000001" });
  const supplier = await makeSupplier(t.db, tid, { name: `${MARK} Supplier` });
  const [sale] = await t.db
    .insert(schema.sales)
    .values({ tenantId: tid, storeId: s.store.id, invoiceNo: `${MARK}/1`, status: "completed", customerId: customer.id, totalAmount: 10000, paidAmount: 10000, creditAmount: 0, createdBy: s.user.id, completedAt: new Date() })
    .returning();
  const [purchase] = await t.db
    .insert(schema.purchases)
    .values({ tenantId: tid, storeId: s.store.id, purchaseNo: "P/1", supplierId: supplier.id, supplierInvoiceNo: `${MARK}-SB1`, invoiceDate: "2026-10-01", totalAmount: 5000, paidAmount: 0, createdBy: s.user.id })
    .returning();
  const [doctor] = await t.db.insert(schema.doctors).values({ tenantId: tid, name: `Dr ${MARK}`, regNo: `${MARK}-REG` }).returning();
  const [rx] = await t.db
    .insert(schema.prescriptions)
    .values({ tenantId: tid, storeId: s.store.id, patientName: `${MARK} Patient`, doctorName: `Dr ${MARK}`, prescriptionDate: "2026-10-01" })
    .returning();
  const [order] = await t.db
    .insert(schema.externalOrders)
    .values({ tenantId: tid, orderNo: `${MARK}-ORD`, customerName: `${MARK} Buyer`, customerPhone: "9000000002", items: [{ name: "x", qty: 1 }], status: "received" })
    .returning();
  const [promise] = await t.db
    .insert(schema.promiseOrders)
    .values({ tenantId: tid, storeId: s.store.id, customerName: `${MARK} Promisee`, customerPhone: "9000000003", medicineName: `${MARK} Drug`, qtyRequested: 2, createdBy: s.user.id })
    .returning();
  const [rep] = await t.db.insert(schema.medicalReps).values({ tenantId: tid, name: `${MARK} Rep`, isActive: true }).returning();
  const [scheme] = await t.db.insert(schema.schemes).values({ tenantId: tid, name: `${MARK} Scheme`, schemeType: "free_qty", isActive: true }).returning();
  const [reminder] = await t.db
    .insert(schema.reminders)
    .values({ tenantId: tid, customerPhone: "9000000004", scheduledDate: "2026-12-01", message: `${MARK} reminder` })
    .returning();
  const [group] = await t.db.insert(schema.customerGroups).values({ tenantId: tid, name: `${MARK} Family` }).returning();
  await t.db.insert(schema.whatsappMessages).values({ tenantId: tid, customerPhone: "9000000005", messageBody: `${MARK} hello` });
  await t.db.insert(schema.whatsappTemplates).values({ tenantId: tid, name: `${MARK}_tmpl`, body: `${MARK} body` });
  await t.db.insert(schema.whatsappConfigs).values({ tenantId: tid, phoneNumberId: `${MARK}-PHONE` });
  await t.db.insert(schema.smsConfigs).values({ tenantId: tid, senderId: `${MARK}` });
  const [stmt] = await t.db
    .insert(schema.bankStatements)
    .values({ tenantId: tid, bankName: `${MARK} Bank`, accountNo: "123", statementDate: "2026-10-01" })
    .returning();
  const [line] = await t.db
    .insert(schema.bankStatementLines)
    .values({ tenantId: tid, statementId: stmt.id, transactionDate: "2026-10-01", description: `${MARK} line` })
    .returning();
  const [apiKey] = await t.db.insert(schema.apiKeys).values({ tenantId: tid, name: `${MARK} key`, keyHash: `${MARK}hash` }).returning();
  const [gstDoc] = await t.db
    .insert(schema.gstDocuments)
    .values({ tenantId: tid, storeId: s.store.id, docType: "invoice", docNo: `${MARK}/DOC1`, docDate: "2026-10-01", supplyType: "B2B", partyName: `${MARK} Party`, taxableAmount: 1000, total: 1050, refType: "sale", refId: sale.id })
    .returning();
  await t.db.insert(schema.auditLogs).values({ tenantId: tid, userId: s.user.id, action: "create", entityType: `${MARK}_thing` });
  const [acct] = await t.db.insert(schema.accounts).values({ tenantId: tid, code: "9999", name: `${MARK} Account`, type: "asset" }).returning();
  const [je] = await t.db.insert(schema.journalEntries).values({ tenantId: tid, storeId: s.store.id, entryNo: "JV/9", entryDate: "2026-10-01", narration: `${MARK} narration` }).returning();
  await t.db.insert(schema.journalLines).values({ tenantId: tid, entryId: je.id, accountId: acct.id, debit: 100, credit: 0 });
  return { ...s, maker, cat, rack, medicine, batch, customer, supplier, sale, purchase, doctor, rx, order, promise, rep, scheme, reminder, group, stmt, line, apiKey, gstDoc };
}

let A: Awaited<ReturnType<typeof seedVictim>>;
let B: Side;
beforeAll(async () => {
  A = await seedVictim();
  B = await makeSide("B");
});

const leaks = (result: unknown) => JSON.stringify(result ?? null).includes(MARK);

/** The caller got nothing useful: it threw, or returned null / empty / an error. */
async function denied(call: () => Promise<unknown>) {
  let r: unknown;
  try {
    r = await call();
  } catch {
    return true; // refused with an exception
  }
  if (r == null) return true;
  if (Array.isArray(r)) return r.length === 0;
  if (typeof r === "object") {
    const o = r as Record<string, unknown>;
    if ("error" in o && o.error) return true;
    if ("serverError" in o && o.serverError) return true;
    if ("validationErrors" in o && o.validationErrors) return true;
    if ("success" in o && o.success === false) return true;
  }
  return false;
}

const form = (fields: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("pharmacy B cannot READ pharmacy A's lists", () => {
  const reads: [string, () => Promise<unknown>][] = [
    ["getMedicines", () => getMedicines()],
    ["getCategories", () => getCategories()],
    ["getManufacturers", () => getManufacturers()],
    ["getRacks", () => getRacks()],
    ["getBatches", () => getBatches()],
    ["getSales", () => getSales()],
    ["searchPosItems", () => searchPosItems("ZZISOLATION")],
    ["getAccounts", () => getAccounts()],
    ["getJournalLines", () => getJournalLines()],
    ["getTrialBalance", () => getTrialBalance()],
    ["getCustomers", () => getCustomers()],
    ["getCustomerGroups", () => getCustomerGroups()],
    ["getSuppliers", () => getSuppliers()],
    ["getPurchases", () => getPurchases()],
    ["getDoctors", () => getDoctors()],
    ["getPrescriptions", () => getPrescriptions({})],
    ["getExternalOrders", () => getExternalOrders()],
    ["getPromiseOrders", () => getPromiseOrders()],
    ["getMedicalReps", () => getMedicalReps()],
    ["getSchemes", () => getSchemes()],
    ["getReminders", () => getReminders()],
    ["getWhatsAppMessages", () => getWhatsAppMessages()],
    ["getWhatsAppTemplates", () => getWhatsAppTemplates()],
    ["getWhatsAppConfig", () => getWhatsAppConfig()],
    ["getSmsConfig", () => getSmsConfig()],
    ["getBankStatements", () => getBankStatements()],
    ["getGstDashboard", () => getGstDashboard()],
    ["getOutwardSupplies", () => getOutwardSupplies()],
    ["getDashboardStats", () => getDashboardStats()],
    ["listApiKeys", () => listApiKeys()],
  ];

  it.each(reads)("%s returns none of A's data", async (_name, call) => {
    signInAs(B);
    const r = await call();
    expect(leaks(r)).toBe(false);
  });

  it("control: pharmacy A sees its own data through the same calls", async () => {
    signInAs(A);
    expect(leaks(await getMedicines())).toBe(true);
    expect(leaks(await getCustomers())).toBe(true);
    expect(leaks(await getSuppliers())).toBe(true);
    expect(leaks(await getExternalOrders())).toBe(true);
    expect(leaks(await getSmsConfig())).toBe(true);
  });
});

/** A compact picture of everything an attacker could try to change in A's data. */
async function snapshotOfA() {
  const pick = async (table: PgTable & { id: AnyPgColumn }, id: string) => (await t.db.select().from(table).where(eq(table.id, id)))[0];
  return JSON.stringify({
    supplier: await pick(schema.suppliers, A.supplier.id),
    customer: await pick(schema.customers, A.customer.id),
    order: await pick(schema.externalOrders, A.order.id),
    promise: await pick(schema.promiseOrders, A.promise.id),
    rep: await pick(schema.medicalReps, A.rep.id),
    scheme: await pick(schema.schemes, A.scheme.id),
    rx: await pick(schema.prescriptions, A.rx.id),
    reminder: await pick(schema.reminders, A.reminder.id),
    apiKey: await pick(schema.apiKeys, A.apiKey.id),
    rack: await pick(schema.racks, A.rack.id),
    medicine: await pick(schema.medicines, A.medicine.id),
    batch: await pick(schema.batches, A.batch.id),
    group: await pick(schema.customerGroups, A.group.id),
    gstDoc: await pick(schema.gstDocuments, A.gstDoc.id),
    line: await pick(schema.bankStatementLines, A.line.id),
    batches: (await t.db.select().from(schema.batches).where(eq(schema.batches.tenantId, A.tenant.id))).length,
    movements: (await t.db.select().from(schema.stockMovements).where(eq(schema.stockMovements.tenantId, A.tenant.id))).length,
    loyalty: (await t.db.select().from(schema.loyaltyTransactions).where(eq(schema.loyaltyTransactions.tenantId, A.tenant.id))).length,
    audit: (await t.db.select().from(schema.auditLogs).where(eq(schema.auditLogs.tenantId, A.tenant.id))).length,
    // rows created in A's name
    medicines: (await t.db.select().from(schema.medicines).where(eq(schema.medicines.tenantId, A.tenant.id))).length,
  });
}

describe("pharmacy B cannot READ or TOUCH one of A's records by id", () => {
  const attacks: [string, () => Promise<unknown>][] = [
    ["getSaleById", () => getSaleById(A.sale.id)],
    ["getPurchaseById", () => getPurchaseById(A.purchase.id)],
    ["getSupplierById", () => getSupplierById(A.supplier.id)],
    ["updateSupplier", () => updateSupplier(A.supplier.id, form({ name: "HACKED" }))],
    ["updateCustomer", () => updateCustomer(A.customer.id, form({ name: "HACKED" }))],
    ["getFamilyGroupDetails", () => getFamilyGroupDetails(A.group.id)],
    ["addCustomerToGroup", () => addCustomerToGroup(A.group.id, A.customer.id)],
    ["getCustomerLoyalty", () => getCustomerLoyalty(A.customer.id)],
    ["adjustCustomerLoyalty", () => adjustCustomerLoyalty(A.customer.id, 500, "free points")],
    ["getOrderById", () => getOrderById(A.order.id)],
    ["updateOrderStatus", () => updateOrderStatus(A.order.id, "delivered")],
    ["updatePromiseOrderStatus", () => updatePromiseOrderStatus(A.promise.id, "cancelled")],
    ["toggleMedicalRepStatus", () => toggleMedicalRepStatus(A.rep.id, true)],
    ["toggleSchemeStatus", () => toggleSchemeStatus(A.scheme.id, false)],
    ["deleteScheme", () => deleteScheme(A.scheme.id)],
    ["getPrescriptionDetails", () => getPrescriptionDetails(A.rx.id)],
    ["cancelPrescription", () => cancelPrescription(A.rx.id, "hack")],
    ["cancelReminder", () => cancelReminder(A.reminder.id)],
    ["getStatementLines", () => getStatementLines(A.stmt.id)],
    ["runAutoMatch", () => runAutoMatch(A.stmt.id)],
    ["unmatchLine", () => unmatchLine(A.line.id)],
    ["revokeApiKey", () => revokeApiKey(A.apiKey.id)],
    ["generateEInvoiceAction", () => generateEInvoiceAction(A.gstDoc.id)],
    ["cancelEInvoiceAction", () => cancelEInvoiceAction(A.gstDoc.id, "1", "x")],
    ["updateRack", () => updateRack({ id: A.rack.id, code: "HACK", name: "HACKED" })],
    ["deleteRack", () => deleteRack({ id: A.rack.id })],
    ["assignMedicineToRack", () => assignMedicineToRack({ medicineId: A.medicine.id, rackId: A.rack.id })],
    ["adjustBatchStock", () => adjustBatchStock(form({ batchId: A.batch.id, qtyChange: "-5", reason: "damage" }))],
    ["addOpeningStock", () => addOpeningStock(form({ medicineId: A.medicine.id, batchNo: "EVIL", expiryDate: "2099-01-01", qty: "99", mrp: "1" }))],
  ];

  it.each(attacks)("%s returns nothing of A's and changes nothing", async (_name, call) => {
    const before = await snapshotOfA();
    signInAs(B);
    let result: unknown;
    try {
      result = await call();
    } catch {
      result = null; // refusing with an exception is fine
    }
    expect(leaks(result), "the response contains pharmacy A's data").toBe(false);
    expect(await snapshotOfA(), "pharmacy A's data was modified").toBe(before);
    // nothing was written into B's own pharmacy under A's ids either
    expect(await t.db.select().from(schema.stockMovements).where(eq(schema.stockMovements.tenantId, B.tenant.id))).toHaveLength(0);
  });
});

describe("pharmacy B cannot point its own records at pharmacy A's", () => {
  it("createMedicine with A's category, manufacturer or rack is refused", async () => {
    signInAs(B);
    for (const ref of [{ categoryId: A.cat.id }, { manufacturerId: A.maker.id }, { rackId: A.rack.id }] as Record<string, string>[]) {
      const res = await createMedicine(form({ name: "Sneaky", mrp: "10", ...ref }));
      expect(res, JSON.stringify(ref)).toHaveProperty("error");
    }
    expect(await t.db.select().from(schema.medicines).where(eq(schema.medicines.tenantId, B.tenant.id))).toHaveLength(0);
  });
});
