import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";

export interface AuditLogFilters {
  userId?: string;
  entityType?: string;
  action?: string;
  /** YYYY-MM-DD, inclusive (local day). */
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogRow {
  id: number;
  createdAt: Date;
  userId: string | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
}

export const AUDIT_PAGE_SIZE = 50;

/**
 * Reads the audit trail of ONE pharmacy, newest first. Always scoped by tenant: callers pass the tenant
 * from the auth context, never from the browser. (Read-only: there is deliberately no update or delete.)
 */
export async function queryAuditLogs(
  database: DbOrTx,
  tenantId: string,
  f: AuditLogFilters = {},
): Promise<{ rows: AuditLogRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = Math.min(Math.max(f.pageSize ?? AUDIT_PAGE_SIZE, 1), 200);
  const page = Math.max(f.page ?? 1, 1);

  const conditions = [eq(schema.auditLogs.tenantId, tenantId)];
  if (f.userId) conditions.push(eq(schema.auditLogs.userId, f.userId));
  if (f.entityType) conditions.push(eq(schema.auditLogs.entityType, f.entityType));
  if (f.action) conditions.push(eq(schema.auditLogs.action, f.action));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) conditions.push(gte(schema.auditLogs.createdAt, new Date(`${f.from}T00:00:00`)));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) conditions.push(lte(schema.auditLogs.createdAt, new Date(`${f.to}T23:59:59.999`)));
  const where = and(...conditions);

  const [{ total }] = await database.select({ total: count() }).from(schema.auditLogs).where(where);

  const rows = await database
    .select({
      id: schema.auditLogs.id,
      createdAt: schema.auditLogs.createdAt,
      userId: schema.auditLogs.userId,
      userName: schema.users.name,
      action: schema.auditLogs.action,
      entityType: schema.auditLogs.entityType,
      entityId: schema.auditLogs.entityId,
      oldValue: schema.auditLogs.oldValue,
      newValue: schema.auditLogs.newValue,
      reason: schema.auditLogs.reason,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
    .where(where)
    .orderBy(desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total: Number(total), page, pageSize };
}

/** Values for the filter drop-downs: the people and the kinds of records that appear in this pharmacy's log. */
export async function auditFilterOptions(database: DbOrTx, tenantId: string) {
  const users = await database
    .selectDistinct({ id: schema.auditLogs.userId, name: schema.users.name })
    .from(schema.auditLogs)
    .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
    .where(eq(schema.auditLogs.tenantId, tenantId));
  const entities = await database
    .selectDistinct({ entityType: schema.auditLogs.entityType })
    .from(schema.auditLogs)
    .where(eq(schema.auditLogs.tenantId, tenantId));
  const actions = await database
    .selectDistinct({ action: schema.auditLogs.action })
    .from(schema.auditLogs)
    .where(eq(schema.auditLogs.tenantId, tenantId));
  return {
    users: users.filter((u): u is { id: string; name: string | null } => !!u.id).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    entityTypes: entities.map((e) => e.entityType).sort(),
    actions: actions.map((a) => a.action).sort(),
  };
}
