import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { ALL_PERMISSIONS, SYSTEM_ROLES } from "@/lib/permissions";
import { loadAuthCtx } from "@/server/rbac";
import { createTestDb } from "../setup/db";

const h = vi.hoisted(() => ({ db: undefined as unknown, sessions: [] as unknown[][] }));
vi.mock("@/server/db", async () => ({
  get db() {
    return h.db;
  },
  schema: await import("@/server/db/schema"),
}));
vi.mock("@/server/auth", () => ({
  hashPassword: async (p: string) => `hash:${p}`,
  verifyPassword: async () => true,
  generateSessionToken: () => "token",
  createSession: async (...args: unknown[]) => void h.sessions.push(args),
  setSessionCookie: async () => {},
  deleteSessionCookie: async () => {},
  invalidateSession: async () => {},
  getCurrentSession: async () => ({ session: null, user: null }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  },
  forbidden: () => {
    throw new Error("NEXT_FORBIDDEN");
  },
}));

import { registerAction } from "@/app/actions/auth";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
  h.db = t.db;
});
afterAll(async () => {
  await t.cleanup();
});

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("registerAction", () => {
  it("creates a pharmacy whose first user is an Owner with ALL permissions (not locked out)", async () => {
    await expect(
      registerAction(null, form({ name: "Asha", email: "Asha@Example.test", password: "pw-123456", pharmacyName: "Asha Medicos" })),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");

    const [tenant] = await t.db.select().from(schema.tenants).where(eq(schema.tenants.name, "Asha Medicos"));
    const roles = await t.db.select().from(schema.roles).where(eq(schema.roles.tenantId, tenant.id));
    expect(roles.map((r) => r.key).sort()).toEqual(SYSTEM_ROLES.map((r) => r.key).sort());

    const [user] = await t.db.select().from(schema.users).where(eq(schema.users.email, "asha@example.test"));
    const [store] = await t.db.select().from(schema.stores).where(eq(schema.stores.tenantId, tenant.id));
    const ctx = await loadAuthCtx(t.db, { tenantId: tenant.id, storeId: store.id }, { ...user, pharmacistRegNo: null });
    expect([...ctx.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
    expect(ctx.allowedStoreIds).toBe("all");
    expect(h.sessions).toHaveLength(1); // signed in straight away
  });

  it("refuses a second registration with the same email", async () => {
    const res = await registerAction(null, form({ name: "Other", email: "asha@example.test", password: "x", pharmacyName: "Dup" }));
    expect(res).toEqual({ error: "Email already in use" });
  });

  it("requires every field", async () => {
    expect(await registerAction(null, form({ name: "A", email: "", password: "x", pharmacyName: "P" }))).toEqual({ error: "All fields are required" });
  });
});
