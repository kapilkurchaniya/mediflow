"use server";

import { db } from "@/server/db";
import { requirePermission } from "@/server/rbac";
import { auditFilterOptions, queryAuditLogs, type AuditLogFilters } from "@/server/domain/audit-log";

/** Audit trail of the signed-in pharmacy. Needs `audit.view` (owner, manager, auditor). */
export async function getAuditLogs(filters: AuditLogFilters = {}) {
  const ctx = await requirePermission("audit.view");
  return queryAuditLogs(db, ctx.tenantId, filters);
}

export async function getAuditFilterOptions() {
  const ctx = await requirePermission("audit.view");
  return auditFilterOptions(db, ctx.tenantId);
}
