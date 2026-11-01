import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { seedSystemRoles } from "@/server/roles";
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

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createMedicine } from "@/app/actions/inventory";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
afterAll(async () => {
  await t.cleanup();
});

async function pharmacy(roleKey = "owner") {
  const tenant = await makeTenant(t.db);
  const store = await makeStore(t.db, tenant.id);
  const user = await makeUser(t.db);
  const ids = await seedSystemRoles(t.db, tenant.id);
  await t.db.insert(schema.memberships).values({ tenantId: tenant.id, userId: user.id, roleId: ids[roleKey] });
  h.session = { tenantId: tenant.id, storeId: store.id };
  h.user = user;
  return { tenant, store, user };
}

describe("Medicine Packaging & Unit Conversion (A2.10 Catalog Actions)", () => {
  it("persists unitsPerPack, packUnit, looseUnit on createMedicine and records audit log", async () => {
    const { tenant } = await pharmacy("owner");

    const formData = new FormData();
    formData.append("name", "Amoxicillin 250");
    formData.append("genericName", "Amoxicillin");
    formData.append("packUnit", "strip");
    formData.append("unitsPerPack", "15");
    formData.append("looseUnit", "capsule");
    formData.append("packSize", "15 capsules");
    formData.append("mrp", "150.00");
    formData.append("salePrice", "150.00");
    formData.append("gstRateBp", "5");

    const result = await createMedicine(formData);
    expect(result.success).toBe(true);

    const [created] = await t.db
      .select()
      .from(schema.medicines)
      .where(and(eq(schema.medicines.name, "Amoxicillin 250"), eq(schema.medicines.tenantId, tenant.id)));

    expect(created).toBeDefined();
    expect(created.unitsPerPack).toBe(15);
    expect(created.packUnit).toBe("strip");
    expect(created.looseUnit).toBe("capsule");
    expect(created.mrp).toBe(15000);

    // Audit log check
    const [audit] = await t.db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityType, "medicine"),
          eq(schema.auditLogs.entityId, created.id),
          eq(schema.auditLogs.tenantId, tenant.id),
        ),
      );

    expect(audit).toBeDefined();
    const parsedNew = audit.newValue as Record<string, unknown>;
    expect(parsedNew.unitsPerPack).toBe(15);
    expect(parsedNew.packUnit).toBe("strip");
    expect(parsedNew.looseUnit).toBe("capsule");
  });

  it("rejects non-positive or invalid unitsPerPack values", async () => {
    await pharmacy("owner");

    const formData = new FormData();
    formData.append("name", "Bad Unit Med");
    formData.append("unitsPerPack", "0");

    const resZero = await createMedicine(formData);
    expect(resZero.error).toBe("Units per pack must be a whole number of at least 1.");

    const formNegative = new FormData();
    formNegative.append("name", "Bad Unit Med 2");
    formNegative.append("unitsPerPack", "-5");

    const resNeg = await createMedicine(formNegative);
    expect(resNeg.error).toBe("Units per pack must be a whole number of at least 1.");

    const formFloat = new FormData();
    formFloat.append("name", "Bad Unit Med 3");
    formFloat.append("unitsPerPack", "10.5");

    const resFloat = await createMedicine(formFloat);
    expect(resFloat.error).toBe("Units per pack must be a whole number of at least 1.");
  });

  it("defaults to 1 unit per pack when unitsPerPack is not specified", async () => {
    const { tenant } = await pharmacy("owner");

    const formData = new FormData();
    formData.append("name", "Cough Syrup 100ml");
    formData.append("packUnit", "bottle");

    const result = await createMedicine(formData);
    expect(result.success).toBe(true);

    const [created] = await t.db
      .select()
      .from(schema.medicines)
      .where(and(eq(schema.medicines.name, "Cough Syrup 100ml"), eq(schema.medicines.tenantId, tenant.id)));

    expect(created.unitsPerPack).toBe(1);
    expect(created.packUnit).toBe("bottle");
    expect(created.looseUnit).toBe("tablet");
  });
});
