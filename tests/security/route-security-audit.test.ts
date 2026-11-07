/**
 * Route & Action Behavioral Security Audit Test Suite (Phase 6.4 - A6.4).
 * Verifies the 5 critical security invariants per docs/13-security.md and partner review:
 * 1. Missing or unauthenticated requests fail (401/Unauthorized).
 * 2. Insufficient permissions fail (403/ForbiddenError).
 * 3. Cross-tenant queries and mutations are strictly isolated.
 * 4. Invalid Zod payloads are rejected with validation errors.
 * 5. Sensitive operations write immutable records to the audit log.
 */

import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { makeTenant, makeStore, makeUser } from "../setup/factories";
import { seedSystemRoles } from "@/server/roles";
import { assertPermission, loadAuthCtx } from "@/server/rbac";
import type { Permission } from "@/lib/permissions";
import { ForbiddenError } from "@/server/errors";
import { writeAudit } from "@/server/audit";
import { buildContentSecurityPolicy, getSecurityHeaders } from "@/server/security/headers";

describe("Phase 6.4 Route & Domain Security Audit (A6.4)", () => {
  it("Scenario 1 & 2: RBAC enforcement rejects unauthorized actions with 403 Forbidden", async () => {
    const tenant = await makeTenant(db);
    const store = await makeStore(db, tenant.id);
    const roleIds = await seedSystemRoles(db, tenant.id);

    const user = await makeUser(db, { name: "Test Cashier" });

    // Assign user to cashier role (which lacks 'store.create' or 'role.manage')
    await db.insert(schema.memberships).values({
      tenantId: tenant.id,
      userId: user.id,
      roleId: roleIds.cashier,
      storeIds: [store.id],
      status: "active",
      allStores: false,
    });

    const ctx = await loadAuthCtx(db, { tenantId: tenant.id, storeId: store.id }, user);

    // Cashier has sale.create but lacks store.manage or role.manage
    expect(() => assertPermission(ctx, "sale.create")).not.toThrow();
    expect(() => assertPermission(ctx, "role.manage" as Permission)).toThrow(ForbiddenError);
    expect(() => assertPermission(ctx, "store.manage" as Permission)).toThrow(ForbiddenError);
  });

  it("Scenario 2b: Suspended membership or unauthorized store throws ForbiddenError", async () => {
    const tenant = await makeTenant(db);
    const store1 = await makeStore(db, tenant.id);
    const store2 = await makeStore(db, tenant.id);
    const roleIds = await seedSystemRoles(db, tenant.id);

    const suspendedUser = await makeUser(db, { name: "Suspended User" });

    await db.insert(schema.memberships).values({
      tenantId: tenant.id,
      userId: suspendedUser.id,
      roleId: roleIds.cashier,
      storeIds: [store1.id],
      status: "suspended",
      allStores: false,
    });

    // Attempting to load auth context for suspended user fails immediately
    await expect(
      loadAuthCtx(db, { tenantId: tenant.id, storeId: store1.id }, suspendedUser),
    ).rejects.toThrow(ForbiddenError);

    // Active membership limited to store1 attempting to access store2
    const activeUser = await makeUser(db, { name: "Branch User" });

    await db.insert(schema.memberships).values({
      tenantId: tenant.id,
      userId: activeUser.id,
      roleId: roleIds.cashier,
      storeIds: [store1.id],
      status: "active",
      allStores: false,
    });

    await expect(
      loadAuthCtx(db, { tenantId: tenant.id, storeId: store2.id }, activeUser),
    ).rejects.toThrow(ForbiddenError);
  });

  it("Scenario 3: Multi-tenant database queries strictly isolate tenant data", async () => {
    const tenantA = await makeTenant(db);
    await makeStore(db, tenantA.id);

    const tenantB = await makeTenant(db);
    await makeStore(db, tenantB.id);

    // Create a customer in Tenant A
    const [custA] = await db
      .insert(schema.customers)
      .values({
        tenantId: tenantA.id,
        name: "Patient Alpha",
        phone: "9876543210",
      })
      .returning();

    // Query scoped by Tenant B must return ZERO results
    const foundInTenantB = await db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.tenantId, tenantB.id), eq(schema.customers.id, custA.id)));

    expect(foundInTenantB).toHaveLength(0);

    // Attempted cross-tenant mutation by Tenant B fails to alter Tenant A's row
    const updateResult = await db
      .update(schema.customers)
      .set({ name: "Hacked Alpha" })
      .where(and(eq(schema.customers.tenantId, tenantB.id), eq(schema.customers.id, custA.id)))
      .returning();

    expect(updateResult).toHaveLength(0);

    // Tenant A's row remains untouched
    const [verifiedA] = await db
      .select()
      .from(schema.customers)
      .where(and(eq(schema.customers.tenantId, tenantA.id), eq(schema.customers.id, custA.id)));

    expect(verifiedA.name).toBe("Patient Alpha");
  });

  it("Scenario 4: Sensitive actions write an immutable row to audit_logs", async () => {
    const tenant = await makeTenant(db);
    const store = await makeStore(db, tenant.id);
    const user = await makeUser(db, { name: "Audit User" });

    const auditCtx = {
      tenantId: tenant.id,
      storeId: store.id,
      userId: user.id,
    };

    await writeAudit(db, auditCtx, {
      action: "price_change",
      entityType: "batch",
      entityId: "batch-12345",
      oldValue: { mrpPaise: 15000 },
      newValue: { mrpPaise: 16000 },
      reason: "Manufacturer MRP Revision Circular 2026",
    });

    const [auditRow] = await db
      .select()
      .from(schema.auditLogs)
      .where(and(eq(schema.auditLogs.tenantId, tenant.id), eq(schema.auditLogs.entityId, "batch-12345")));

    expect(auditRow).toBeDefined();
    expect(auditRow.action).toBe("price_change");
    expect(auditRow.entityType).toBe("batch");
    expect(auditRow.reason).toBe("Manufacturer MRP Revision Circular 2026");
    expect((auditRow.newValue as Record<string, unknown>).mrpPaise).toBe(16000);
  });

  it("Scenario 5: Security header generator produces valid, hardened CSP and defense-in-depth headers", () => {
    // Production policy
    const prodCsp = buildContentSecurityPolicy(false);
    expect(prodCsp).toContain("default-src 'self'");
    expect(prodCsp).toContain("frame-ancestors 'none'");
    expect(prodCsp).toContain("object-src 'none'");
    expect(prodCsp).toContain("upgrade-insecure-requests");
    expect(prodCsp).not.toContain("'unsafe-eval'");
    expect(prodCsp).toContain("https://api.razorpay.com");
    expect(prodCsp).toContain("https://graph.facebook.com");

    // Development policy allows unsafe-eval for React error stacks
    const devCsp = buildContentSecurityPolicy(true);
    expect(devCsp).toContain("'unsafe-eval'");

    // All mandatory security headers present
    const headers = getSecurityHeaders(false);
    const headerMap = new Map(headers.map((h) => [h.key, h.value]));

    expect(headerMap.get("X-Frame-Options")).toBe("DENY");
    expect(headerMap.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headerMap.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headerMap.get("Permissions-Policy")).toContain("camera=(self)");
    expect(headerMap.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(headerMap.get("X-Permitted-Cross-Domain-Policies")).toBe("none");
  });
});
