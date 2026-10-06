"use server";

import { db, schema } from "@/server/db";
import { eq, and, desc, sql, gte, lt } from "drizzle-orm";
import { getCurrentSession, requireAuth } from "@/server/auth";

export async function getDashboardStats() {
  const { session } = await requireAuth();

  const todayStr = new Date().toISOString().split("T")[0];
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
  const expiryThresholdStr = ninetyDaysFromNow.toISOString().split("T")[0];

  // 1. Today's Sales
  const [salesResult] = await db
    .select({
      totalSales: sql<number>`sum(${schema.sales.totalAmount})`.mapWith(Number),
      count: sql<number>`count(${schema.sales.id})`.mapWith(Number),
    })
    .from(schema.sales)
    .where(
      and(
        eq(schema.sales.storeId, session.storeId),
        sql`DATE(${schema.sales.createdAt}) = ${todayStr}::date`
      )
    );

  // 2. Expiring Soon (qty > 0 and expiry <= 90 days)
  const [expiringResult] = await db
    .select({ count: sql<number>`count(${schema.batches.id})`.mapWith(Number) })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.storeId, session.storeId),
        gte(schema.batches.qtyOnHand, 1),
        lt(schema.batches.expiryDate, expiryThresholdStr) // PostgreSQL can compare date strings in YYYY-MM-DD
      )
    );

  // 3. Low Stock Items
  // Sum of batch qtys per medicine compared to medicine.minStockLevel
  const lowStockResult = await db.execute(sql`
    SELECT COUNT(*) as count FROM (
      SELECT m.id, m.name, COALESCE(SUM(b.qty_on_hand), 0) as total_qty, m.reorder_level
      FROM ${schema.medicines} m
      LEFT JOIN ${schema.batches} b ON m.id = b.medicine_id AND b.store_id = ${session.storeId}
      WHERE m.tenant_id = ${session.tenantId} AND m.is_active = true
      GROUP BY m.id, m.name, m.reorder_level
      HAVING COALESCE(SUM(b.qty_on_hand), 0) <= COALESCE(m.reorder_level, 10)
    ) as subquery
  `);

  // 4. Recent Sales
  const recentSales = await db
    .select({
      id: schema.sales.id,
      invoiceNo: schema.sales.invoiceNo,
      totalAmount: schema.sales.totalAmount,
      createdAt: schema.sales.createdAt,
      customerName: schema.customers.name,
    })
    .from(schema.sales)
    .leftJoin(schema.customers, eq(schema.sales.customerId, schema.customers.id))
    .where(
      and(
        eq(schema.sales.tenantId, session.tenantId),
        eq(schema.sales.storeId, session.storeId)
      )
    )
    .orderBy(desc(schema.sales.createdAt))
    .limit(5);

  return {
    todaySales: salesResult?.totalSales || 0,
    todayCount: salesResult?.count || 0,
    expiringSoonCount: expiringResult?.count || 0,
    lowStockCount: Number(lowStockResult.rows[0]?.count || 0),
    recentSales,
  };
}
