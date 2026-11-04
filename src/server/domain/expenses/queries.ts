import { and, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { schema, type DbOrTx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";
import type { ExpenseSummaryStats } from "./types";

export async function listExpenseAccounts(db: DbOrTx, tenantId: string) {
  return db
    .select({
      id: schema.accounts.id,
      code: schema.accounts.code,
      name: schema.accounts.name,
      systemKey: schema.accounts.systemKey,
      isActive: schema.accounts.isActive,
    })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, tenantId), eq(schema.accounts.type, "expense"), eq(schema.accounts.isActive, true)))
    .orderBy(schema.accounts.code);
}

export async function listExpensePayments(
  db: DbOrTx,
  ctx: AuthCtx,
  params: {
    page?: number;
    pageSize?: number;
    search?: string;
    expenseAccountId?: string;
    method?: string;
    dateFrom?: string | null;
    dateTo?: string | null;
    canViewAllStores?: boolean;
  },
) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const conditions = [
    eq(schema.payments.tenantId, ctx.tenantId),
    eq(schema.payments.partyType, "expense"),
  ];

  if (!params.canViewAllStores) {
    conditions.push(eq(schema.payments.storeId, ctx.storeId));
  }
  if (params.expenseAccountId) {
    conditions.push(eq(schema.payments.expenseAccountId, params.expenseAccountId));
  }
  if (params.method) {
    conditions.push(eq(schema.payments.method, params.method));
  }
  if (params.dateFrom) {
    conditions.push(gte(schema.payments.paymentDate, params.dateFrom));
  }
  if (params.dateTo) {
    conditions.push(lte(schema.payments.paymentDate, params.dateTo));
  }
  if (params.search) {
    const s = `%${params.search}%`;
    conditions.push(
      sql`(${ilike(schema.payments.paymentNo, s)} OR ${ilike(schema.payments.payeeName, s)} OR ${ilike(schema.payments.reference, s)} OR ${ilike(schema.payments.note, s)})`,
    );
  }

  const whereClause = and(...conditions);

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.payments)
    .where(whereClause);

  const rows = await db
    .select({
      id: schema.payments.id,
      storeId: schema.payments.storeId,
      paymentNo: schema.payments.paymentNo,
      method: schema.payments.method,
      amount: schema.payments.amount,
      paymentDate: schema.payments.paymentDate,
      reference: schema.payments.reference,
      note: schema.payments.note,
      paidFromTill: schema.payments.paidFromTill,
      cashSessionId: schema.payments.cashSessionId,
      payeeName: schema.payments.payeeName,
      vendorInvoiceNo: schema.payments.vendorInvoiceNo,
      vendorInvoiceDate: schema.payments.vendorInvoiceDate,
      vendorGstin: schema.payments.vendorGstin,
      categoryName: schema.accounts.name,
      categoryCode: schema.accounts.code,
      createdAt: schema.payments.createdAt,
    })
    .from(schema.payments)
    .leftJoin(schema.accounts, eq(schema.payments.expenseAccountId, schema.accounts.id))
    .where(whereClause)
    .orderBy(desc(schema.payments.paymentDate), desc(schema.payments.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    items: rows,
    total: countResult?.count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((countResult?.count ?? 0) / pageSize),
  };
}

export async function getExpenseSummaryStats(
  db: DbOrTx,
  ctx: AuthCtx,
  params: { dateFrom?: string | null; dateTo?: string | null; canViewAllStores?: boolean },
): Promise<ExpenseSummaryStats> {
  const conditions = [
    eq(schema.payments.tenantId, ctx.tenantId),
    eq(schema.payments.partyType, "expense"),
  ];
  if (!params.canViewAllStores) {
    conditions.push(eq(schema.payments.storeId, ctx.storeId));
  }
  if (params.dateFrom) conditions.push(gte(schema.payments.paymentDate, params.dateFrom));
  if (params.dateTo) conditions.push(lte(schema.payments.paymentDate, params.dateTo));

  const whereClause = and(...conditions);

  const rows = await db
    .select({
      amount: schema.payments.amount,
      method: schema.payments.method,
      paidFromTill: schema.payments.paidFromTill,
      expenseAccountId: schema.payments.expenseAccountId,
      categoryName: schema.accounts.name,
    })
    .from(schema.payments)
    .leftJoin(schema.accounts, eq(schema.payments.expenseAccountId, schema.accounts.id))
    .where(whereClause);

  let totalExpenses = 0;
  let cashPayouts = 0;
  let digitalPayments = 0;
  const categoryTotals: Record<string, { name: string; total: number }> = {};

  for (const r of rows) {
    const amt = r.amount ?? 0;
    totalExpenses += amt;
    if (r.method === "cash" && r.paidFromTill) {
      cashPayouts += amt;
    } else if (r.method !== "cash") {
      digitalPayments += amt;
    }
    if (r.expenseAccountId && r.categoryName) {
      if (!categoryTotals[r.expenseAccountId]) {
        categoryTotals[r.expenseAccountId] = { name: r.categoryName, total: 0 };
      }
      categoryTotals[r.expenseAccountId].total += amt;
    }
  }

  let topCategory: { name: string; total: number } | null = null;
  for (const cat of Object.values(categoryTotals)) {
    if (!topCategory || cat.total > topCategory.total) {
      topCategory = cat;
    }
  }

  return {
    totalExpenses,
    cashPayouts,
    digitalPayments,
    voucherCount: rows.length,
    topCategory,
  };
}
