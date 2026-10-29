import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";
import type { Permission } from "@/lib/permissions";
import { createTestDb } from "../setup/db";
import { makeStore, makeTenant, makeUser } from "../setup/factories";

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

import { getAccounts, getJournalLines, getTrialBalance } from "@/app/actions/accounting";
import { createCategory, createManufacturer, createMedicine, getCategories, getManufacturers, getMedicines } from "@/app/actions/inventory";
import { getRacks } from "@/app/actions/racks";
import { createSaleInvoice, findSubstitutes, getSaleById, getSales, searchPosItems } from "@/app/actions/sales";
import { getStoreSettings, updateStoreSettings } from "@/app/actions/settings";
import { addOpeningStock, adjustBatchStock, getBatches } from "@/app/actions/stock";
import { getAuditFilterOptions, getAuditLogs } from "@/app/actions/audit";
import { getCustomersWithDue, getRecentReceipts } from "@/app/actions/payments";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
afterAll(async () => {
  await t.cleanup();
});

const noPermission = /don't have permission/;
const form = (fields: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

/** Reads throw a ForbiddenError; legacy form actions return { error }. */
type Case = { name: string; permission: Permission; kind: "read" | "form"; call: () => Promise<unknown> };
const CASES: Case[] = [
  // Inventory & stock
  { name: "getBatches", permission: "inventory.view", kind: "read", call: () => getBatches() },
  { name: "addOpeningStock", permission: "inventory.adjust", kind: "form", call: () => addOpeningStock(form()) },
  { name: "adjustBatchStock", permission: "inventory.adjust", kind: "form", call: () => adjustBatchStock(form()) },
  // Catalogue
  { name: "getMedicines", permission: "medicine.view", kind: "read", call: () => getMedicines() },
  { name: "getCategories", permission: "medicine.view", kind: "read", call: () => getCategories() },
  { name: "getManufacturers", permission: "medicine.view", kind: "read", call: () => getManufacturers() },
  { name: "getRacks", permission: "medicine.view", kind: "read", call: () => getRacks() },
  { name: "createCategory", permission: "medicine.manage", kind: "form", call: () => createCategory("Analgesic") },
  { name: "createManufacturer", permission: "medicine.manage", kind: "form", call: () => createManufacturer("Cipla") },
  { name: "createMedicine", permission: "medicine.manage", kind: "form", call: () => createMedicine(form({ name: "Dolo 650" })) },
  // Sales / POS
  { name: "getSales", permission: "sale.view", kind: "read", call: () => getSales() },
  { name: "getSaleById", permission: "sale.view", kind: "read", call: () => getSaleById("00000000-0000-0000-0000-000000000000") },
  { name: "searchPosItems", permission: "sale.create", kind: "read", call: () => searchPosItems("para") },
  { name: "findSubstitutes", permission: "sale.create", kind: "read", call: () => findSubstitutes("paracetamol") },
  { name: "createSaleInvoice", permission: "sale.create", kind: "form", call: () => createSaleInvoice(undefined, "", [], "cash", 0) },
  // Accounting
  { name: "getAccounts", permission: "accounting.view", kind: "read", call: () => getAccounts() },
  { name: "getJournalLines", permission: "accounting.view", kind: "read", call: () => getJournalLines() },
  { name: "getTrialBalance", permission: "accounting.view", kind: "read", call: () => getTrialBalance() },
  // Receipts
  { name: "getCustomersWithDue", permission: "accounting.post", kind: "read", call: () => getCustomersWithDue() },
  { name: "getRecentReceipts", permission: "accounting.post", kind: "read", call: () => getRecentReceipts() },
  // Audit log
  { name: "getAuditLogs", permission: "audit.view", kind: "read", call: () => getAuditLogs() },
  { name: "getAuditFilterOptions", permission: "audit.view", kind: "read", call: () => getAuditFilterOptions() },
  // Settings
  { name: "getStoreSettings", permission: "settings.manage", kind: "read", call: () => getStoreSettings() },
  { name: "updateStoreSettings", permission: "settings.manage", kind: "form", call: () => updateStoreSettings(form({ name: "Test Pharmacy", invoicePrefix: "INV" })) },
];

/** A signed-in user whose custom role holds exactly `permissions`. */
async function signInWith(permissions: Permission[]) {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id);
  const user = await makeUser(t.db);
  const [role] = await t.db.insert(schema.roles).values({ tenantId: tenant.id, key: `r_${Math.random().toString(36).slice(2, 8)}`, name: "Test role" }).returning();
  if (permissions.length) await t.db.insert(schema.rolePermissions).values(permissions.map((permission) => ({ roleId: role.id, permission })));
  await t.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, roleId: role.id });
  h.session = { tenantId: tenant.id, storeId: store.id };
  h.user = user;
}

describe("Lane A actions: the permission matrix", () => {
  it.each(CASES)("$name is refused for a user with no permissions", async ({ kind, call }) => {
    await signInWith([]);
    if (kind === "read") await expect(call()).rejects.toThrow(noPermission);
    else await expect(call()).resolves.toMatchObject({ error: expect.stringMatching(noPermission) });
  });

  it.each(CASES)("$name lets through a user who holds exactly its permission", async ({ permission, kind, call }) => {
    await signInWith([permission]);
    if (kind === "read") {
      await call().catch((e: Error) => expect(e.message).not.toMatch(noPermission)); // may fail for other reasons (empty data), never for permission
    } else {
      const res = (await call()) as { error?: string };
      expect(res.error ?? "").not.toMatch(noPermission);
    }
  });

  it("permissions of one pharmacy do not carry over to another pharmacy", async () => {
    await signInWith(["sale.create"]);
    const userOfFirst = h.user;
    const other = await makeTenant(t.db);
    const otherStore = await makeStore(t.db, other.id);
    h.session = { tenantId: other.id, storeId: otherStore.id }; // a session pointing at a tenant where this user has no membership
    h.user = userOfFirst;
    await expect(searchPosItems("para")).rejects.toThrow(noPermission);
  });
});
