 import { schema, type DbOrTx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "cancel"
  | "login"
  | "price_change"
  | "stock_adjust"
  | "permission_change"
  | "bulk_update"
  | "discount_override"
  | "fefo_override";

export interface WriteAuditParams {
  action: AuditAction;
  entityType: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Appends a row to audit_logs inside the caller's transaction or with the global db.
 */
export async function writeAudit(
  tx: DbOrTx,
  ctx: Pick<AuthCtx, "tenantId" | "storeId" | "userId">,
  e: WriteAuditParams
) {
  await tx.insert(schema.auditLogs).values({
    tenantId: ctx.tenantId,
    storeId: ctx.storeId,
    userId: ctx.userId,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    oldValue: e.oldValue as Record<string, unknown> | null,
    newValue: e.newValue as Record<string, unknown> | null,
    reason: e.reason,
    ip: e.ip,
    userAgent: e.userAgent,
  });
}
