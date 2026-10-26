 import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";
import type { Permission } from "@/lib/permissions";
import { createTestDb } from "../setup/db";
import { makeStore, makeTenant, makeUser } from "../setup/factories";

const h = vi.hoisted(() => ({
  db: undefined as unknown,
  session: { tenantId: "", storeId: "" },
  user: undefined as unknown,
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

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

// Lane B Actions
import { getPurchases, getPurchaseById, createPurchaseInvoice } from "@/app/actions/purchases";
import { getSuppliers, getSupplierById, createSupplier, updateSupplier } from "@/app/actions/suppliers";
import { getCustomers, createQuickCustomer, createCustomer, updateCustomer } from "@/app/actions/customers";
import { getCustomerGroups, createCustomerGroup } from "@/app/actions/customer-groups";
import { getCustomerLoyalty, getLoyaltyConfig, adjustCustomerLoyalty, saveLoyaltyConfig } from "@/app/actions/loyalty";
import {
  getComplianceOverview,
  getDispensingLogs,
  getDoctors,
  getPrescriptions,
  upsertDoctor,
} from "@/app/actions/compliance";
import {
  getGstDashboard,
  getOutwardSupplies,
  getInwardSupplies,
  getGstReconciliation,
  bulkUpdateGstRates,
  cancelEInvoiceAction,
  generateEWayBillAction,
} from "@/app/actions/gst";
import {
  getTrialBalanceReport,
  getProfitAndLossReport,
  getBalanceSheetReport,
  getCashFlowReport,
  getOutstandingReport,
  getInventoryMovementReport,
  getExpiryAnalysisReport,
} from "@/app/actions/reports";
import { getDashboardStats } from "@/app/actions/dashboard";
import {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  getWhatsAppMessages,
  sendManualWhatsAppMessage,
  getWhatsAppTemplates,
  createWhatsAppTemplate,
} from "@/app/actions/whatsapp";
import { getSmsConfig, saveSmsConfig, sendTestSms } from "@/app/actions/sms";
import { getReminders, createManualReminder, triggerDueRemindersBatch } from "@/app/actions/reminders";

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

type Case = {
  name: string;
  permission: Permission;
  call: () => Promise<unknown>;
};

const CASES: Case[] = [
  // Purchases
  { name: "getPurchases", permission: "purchase.view", call: () => getPurchases() },
  { name: "getPurchaseById", permission: "purchase.view", call: () => getPurchaseById("00000000-0000-0000-0000-000000000000") },
  { name: "createPurchaseInvoice", permission: "purchase.create", call: () => createPurchaseInvoice("00000000-0000-0000-0000-000000000000", "INV-1", "2026-10-21", []) },

  // Suppliers
  { name: "getSuppliers", permission: "supplier.view", call: () => getSuppliers() },
  { name: "getSupplierById", permission: "supplier.view", call: () => getSupplierById("00000000-0000-0000-0000-000000000000") },
  { name: "createSupplier", permission: "supplier.manage", call: () => createSupplier(form({ name: "Cipla Dist" })) },
  { name: "updateSupplier", permission: "supplier.manage", call: () => updateSupplier("00000000-0000-0000-0000-000000000000", form({ name: "Cipla Dist" })) },

  // Customers
  { name: "getCustomers", permission: "customer.view", call: () => getCustomers() },
  { name: "createQuickCustomer", permission: "customer.manage", call: () => createQuickCustomer("John Doe", "9876543210") },
  { name: "createCustomer", permission: "customer.manage", call: () => createCustomer(form({ name: "John Doe", phone: "9876543210" })) },
  { name: "updateCustomer", permission: "customer.manage", call: () => updateCustomer("00000000-0000-0000-0000-000000000000", form({ name: "John Doe" })) },

  // Customer Groups
  { name: "getCustomerGroups", permission: "customer.view", call: () => getCustomerGroups() },
  { name: "createCustomerGroup", permission: "customer.manage", call: () => createCustomerGroup(form({ name: "Sharma Family", creditLimit: "50000" })) },

  // Loyalty
  { name: "getCustomerLoyalty", permission: "customer.view", call: () => getCustomerLoyalty("00000000-0000-0000-0000-000000000000") },
  { name: "getLoyaltyConfig", permission: "customer.view", call: () => getLoyaltyConfig() },
  { name: "adjustCustomerLoyalty", permission: "customer.manage", call: () => adjustCustomerLoyalty("00000000-0000-0000-0000-000000000000", 100, "Goodwill bonus") },
  { name: "saveLoyaltyConfig", permission: "settings.manage", call: () => saveLoyaltyConfig(form({ pointsPerRupee: "1", redemptionValueRupees: "1" })) },

  // Compliance
  { name: "getComplianceOverview", permission: "report.view", call: () => getComplianceOverview() },
  { name: "getDispensingLogs", permission: "report.view", call: () => getDispensingLogs({}) },
  { name: "getDoctors", permission: "report.view", call: () => getDoctors() },
  { name: "getPrescriptions", permission: "prescription.approve", call: () => getPrescriptions({}) },
  { name: "upsertDoctor", permission: "prescription.approve", call: () => upsertDoctor({ name: "Dr. Rao", regNo: "MCI-12345" }) },

  // GST
  { name: "getGstDashboard", permission: "gst.view", call: () => getGstDashboard() },
  { name: "getOutwardSupplies", permission: "gst.view", call: () => getOutwardSupplies() },
  { name: "getInwardSupplies", permission: "gst.view", call: () => getInwardSupplies() },
  { name: "getGstReconciliation", permission: "gst.view", call: () => getGstReconciliation() },
  { name: "bulkUpdateGstRates", permission: "medicine.manage", call: () => bulkUpdateGstRates({ fromRateBp: 1200, toRateBp: 500 }) },
  { name: "cancelEInvoiceAction", permission: "accounting.post", call: () => cancelEInvoiceAction("00000000-0000-0000-0000-000000000000", "1", "Duplicate entry") },
  { name: "generateEWayBillAction", permission: "accounting.post", call: () => generateEWayBillAction("00000000-0000-0000-0000-000000000000", { transporterId: "123", distanceKm: 50, transportMode: "1", vehicleNo: "DL01AB1234", vehicleType: "R" }) },

  // Reports
  { name: "getTrialBalanceReport", permission: "report.view", call: () => getTrialBalanceReport() },
  { name: "getProfitAndLossReport", permission: "report.view", call: () => getProfitAndLossReport() },
  { name: "getBalanceSheetReport", permission: "report.view", call: () => getBalanceSheetReport() },
  { name: "getCashFlowReport", permission: "report.view", call: () => getCashFlowReport() },
  { name: "getOutstandingReport", permission: "report.view", call: () => getOutstandingReport("receivable") },
  { name: "getInventoryMovementReport", permission: "report.view", call: () => getInventoryMovementReport() },
  { name: "getExpiryAnalysisReport", permission: "report.view", call: () => getExpiryAnalysisReport() },

  // Dashboard
  { name: "getDashboardStats", permission: "dashboard.view", call: () => getDashboardStats() },

  // WhatsApp
  { name: "getWhatsAppConfig", permission: "settings.manage", call: () => getWhatsAppConfig() },
  { name: "saveWhatsAppConfig", permission: "settings.manage", call: () => saveWhatsAppConfig(form({ phoneNumberId: "phone_123" })) },
  { name: "getWhatsAppMessages", permission: "customer.view", call: () => getWhatsAppMessages() },
  { name: "sendManualWhatsAppMessage", permission: "customer.manage", call: () => sendManualWhatsAppMessage("9876543210", "Hello") },
  { name: "getWhatsAppTemplates", permission: "settings.manage", call: () => getWhatsAppTemplates() },
  { name: "createWhatsAppTemplate", permission: "settings.manage", call: () => createWhatsAppTemplate(form({ name: "test_tmpl", body: "Hello {{1}}" })) },

  // SMS
  { name: "getSmsConfig", permission: "settings.manage", call: () => getSmsConfig() },
  { name: "saveSmsConfig", permission: "settings.manage", call: () => saveSmsConfig(form({ provider: "msg91" })) },
  { name: "sendTestSms", permission: "customer.manage", call: () => sendTestSms("9876543210", "Test SMS") },

  // Reminders
  { name: "getReminders", permission: "customer.view", call: () => getReminders() },
  { name: "createManualReminder", permission: "customer.manage", call: () => createManualReminder(form({ customerName: "Test", customerPhone: "9876543210", scheduledDate: "2026-10-25" })) },
  { name: "triggerDueRemindersBatch", permission: "customer.manage", call: () => triggerDueRemindersBatch() },
];

/** Sign in with a custom role holding exactly `permissions`. */
async function signInWith(permissions: Permission[]) {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id);
  const user = await makeUser(t.db);
  const [role] = await t.db
    .insert(schema.roles)
    .values({
      tenantId: tenant.id,
      key: `r_${Math.random().toString(36).slice(2, 8)}`,
      name: "Test Role",
    })
    .returning();

  if (permissions.length) {
    await t.db
      .insert(schema.rolePermissions)
      .values(permissions.map((permission) => ({ roleId: role.id, permission })));
  }

  await t.db.insert(schema.memberships).values({
    tenantId: tenant.id,
    userId: user.id,
    roleId: role.id,
  });

  h.session = { tenantId: tenant.id, storeId: store.id };
  h.user = user;
}

describe("Lane B actions: the permission matrix", () => {
  it.each(CASES)("$name is refused for a user with no permissions", async ({ call }) => {
    await signInWith([]);
    try {
      const res = await call();
      if (res && typeof res === "object" && "error" in res) {
        expect((res as { error?: string }).error).toMatch(noPermission);
      } else {
        expect.unreachable("Expected action to fail with forbidden error or error object");
      }
    } catch (err: unknown) {
      expect((err as Error).message).toMatch(noPermission);
    }
  });

  it.each(CASES)("$name lets through a user who holds exactly its permission", async ({ permission, call }) => {
    await signInWith([permission]);
    try {
      const res = await call();
      if (res && typeof res === "object" && "error" in res) {
        expect((res as { error?: string }).error ?? "").not.toMatch(noPermission);
      }
    } catch (err: unknown) {
      expect((err as Error).message).not.toMatch(noPermission);
    }
  });
});
