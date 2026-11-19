"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql, gte, lt } from "drizzle-orm";
import { requirePermission } from "@/server/rbac";

export async function getDashboardStats(dateRange?: { from?: string | null; to?: string | null }) {
  const ctx = await requirePermission("dashboard.view");

  const todayStr = new Date().toISOString().split("T")[0];
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
  const expiryThresholdStr = ninetyDaysFromNow.toISOString().split("T")[0];

  // 1. Sales - Filtered by date range if provided, or defaults to today
  const salesConditions = [
    eq(schema.sales.tenantId, ctx.tenantId),
    eq(schema.sales.storeId, ctx.storeId),
    eq(schema.sales.status, "completed"),
  ];

  if (dateRange?.from) {
    salesConditions.push(sql`${schema.sales.createdAt} >= ${dateRange.from}::date`);
  }
  if (dateRange?.to) {
    salesConditions.push(sql`${schema.sales.createdAt} < (${dateRange.to}::date + interval '1 day')`);
  }
  if (!dateRange?.from && !dateRange?.to) {
    salesConditions.push(sql`DATE(${schema.sales.createdAt}) = ${todayStr}::date`);
  }

  const recentSalesConditions = [
    eq(schema.sales.tenantId, ctx.tenantId),
    eq(schema.sales.storeId, ctx.storeId),
  ];
  if (dateRange?.from) {
    recentSalesConditions.push(sql`${schema.sales.createdAt} >= ${dateRange.from}::date`);
  }
  if (dateRange?.to) {
    recentSalesConditions.push(sql`${schema.sales.createdAt} < (${dateRange.to}::date + interval '1 day')`);
  }

  const [[salesResult], [expiringResult], lowStockResult, recentSales] = await Promise.all([
    db
      .select({
        totalSales: sql<number>`sum(${schema.sales.totalAmount})`.mapWith(Number),
        count: sql<number>`count(${schema.sales.id})`.mapWith(Number),
      })
      .from(schema.sales)
      .where(and(...salesConditions)),
    db
      .select({ count: sql<number>`count(${schema.batches.id})`.mapWith(Number) })
      .from(schema.batches)
      .where(
        and(
          eq(schema.batches.tenantId, ctx.tenantId),
          eq(schema.batches.storeId, ctx.storeId),
          gte(schema.batches.qtyOnHand, 1),
          lt(schema.batches.expiryDate, expiryThresholdStr)
        )
      ),
    db.execute(sql`
      SELECT COUNT(*) as count FROM (
        SELECT m.id, m.name, COALESCE(SUM(b.qty_on_hand), 0) as total_qty, m.reorder_level
        FROM ${schema.medicines} m
        LEFT JOIN ${schema.batches} b ON m.id = b.medicine_id AND b.store_id = ${ctx.storeId} AND b.tenant_id = ${ctx.tenantId}
        WHERE m.tenant_id = ${ctx.tenantId} AND m.is_active = true
        GROUP BY m.id, m.name, m.reorder_level
        HAVING COALESCE(SUM(b.qty_on_hand), 0) <= COALESCE(m.reorder_level, 10)
      ) as subquery
    `),
    db
      .select({
        id: schema.sales.id,
        invoiceNo: schema.sales.invoiceNo,
        totalAmount: schema.sales.totalAmount,
        createdAt: schema.sales.createdAt,
        customerName: schema.customers.name,
      })
      .from(schema.sales)
      .leftJoin(schema.customers, eq(schema.sales.customerId, schema.customers.id))
      .where(and(...recentSalesConditions))
      .orderBy(desc(schema.sales.createdAt))
      .limit(5),
  ]);

  return {
    todaySales: salesResult?.totalSales || 0,
    todayCount: salesResult?.count || 0,
    expiringSoonCount: expiringResult?.count || 0,
    lowStockCount: Number(lowStockResult.rows[0]?.count || 0),
    recentSales,
  };
}
