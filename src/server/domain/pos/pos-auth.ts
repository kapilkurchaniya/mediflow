import { NextRequest } from "next/server";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { authenticateDevice } from "@/server/domain/devices/auth";
import { requirePermission, type AuthCtx } from "@/server/rbac";
import type { Permission } from "@/lib/permissions";
import { DomainError } from "@/server/errors";

/**
 * Production POS request authenticator supporting both:
 * 1. Cashier session cookies (standard web POS browser)
 * 2. Device Bearer token (hardware POS / mobile / automated load runner)
 */
export async function authenticatePosRequest(req: NextRequest): Promise<AuthCtx> {
  const authHeader = req.headers.get("authorization");

  if (authHeader && (authHeader.startsWith("Bearer mf_dev_") || authHeader.startsWith("mf_dev_"))) {
    const dev = await authenticateDevice(db, authHeader);

    // Resolve an authorized user in this tenant to bind cashier identity
    const [membership] = await db
      .select({
        userId: schema.memberships.userId,
        userName: schema.users.name,
        userEmail: schema.users.email,
        pharmacistRegNo: schema.users.pharmacistRegNo,
      })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .where(eq(schema.memberships.tenantId, dev.tenantId))
      .limit(1);

    let userId = membership?.userId;
    let userName = membership?.userName || "POS Device Cashier";
    let userEmail = membership?.userEmail || "device@mediflow.internal";
    let pharmacistRegNo = membership?.pharmacistRegNo || null;

    if (!userId) {
      const [deviceRow] = await db
        .select({
          userId: schema.devices.createdBy,
          userName: schema.users.name,
          userEmail: schema.users.email,
          pharmacistRegNo: schema.users.pharmacistRegNo,
        })
        .from(schema.devices)
        .leftJoin(schema.users, eq(schema.devices.createdBy, schema.users.id))
        .where(eq(schema.devices.id, dev.deviceId))
        .limit(1);

      if (deviceRow?.userId) {
        userId = deviceRow.userId;
        userName = deviceRow.userName || userName;
        userEmail = deviceRow.userEmail || userEmail;
        pharmacistRegNo = deviceRow.pharmacistRegNo || null;
      } else {
        const [anyUser] = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email }).from(schema.users).limit(1);
        userId = anyUser?.id || "00000000-0000-0000-0000-000000000001";
        userName = anyUser?.name || userName;
        userEmail = anyUser?.email || userEmail;
      }
    }

    return {
      tenantId: dev.tenantId,
      storeId: dev.storeId,
      userId,
      user: {
        id: userId,
        name: userName,
        email: userEmail,
        pharmacistRegNo,
      },
      permissions: new Set<Permission>(["sale.create", "sale.view", "inventory.view", "medicine.view"]),
      allowedStoreIds: [dev.storeId],
    };
  }

  try {
    return await requirePermission("sale.create");
  } catch {
    throw new DomainError("UNAUTHORIZED", "Valid cashier session or device credentials required.");
  }
}
