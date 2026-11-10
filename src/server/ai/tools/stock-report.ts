import { z } from "zod";
import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import { format, addDays } from "date-fns";
import { db, schema } from "@/server/db";
import type { MediFlowAiTool } from "../types";

export const stockReportTool: MediFlowAiTool<{
  reportType: "summary" | "low_stock" | "near_expiry" | "value";
}> = {
  name: "get_stock_report",
  description:
    "Get a detailed stock report. Can show overall stock summary, stock valuation, low-stock items, or near-expiry items.",
  permission: "inventory.view",
  isWriteAction: false,
  inputSchema: z.object({
    reportType: z
      .enum(["summary", "low_stock", "near_expiry", "value"])
      .describe(
        "Type of stock report: 'summary' for counts, 'low_stock' for items below reorder, 'near_expiry' for 90-day expiries, 'value' for stock valuation"
      ),
  }),
  execute: async (ctx, { reportType }) => {
    if (!ctx.storeId) {
      return { error: "Active store session required to access stock reports." };
    }

    if (reportType === "summary" || reportType === "value") {
      const [row] = await db
        .select({
          totalItems: sql<number>`count(distinct ${schema.medicines.id})::int`,
          totalUnits: sql<number>`coalesce(sum(${schema.batches.qtyOnHand}), 0)::int`,
          stockCostValue: sql<number>`coalesce(sum(${schema.batches.qtyOnHand} * ${schema.batches.purchaseRate}), 0)::bigint`,
          stockSaleValue: sql<number>`coalesce(sum(${schema.batches.qtyOnHand} * coalesce(${schema.batches.saleRate}, ${schema.batches.mrp})), 0)::bigint`,
          itemsInStock: sql<number>`count(distinct case when ${schema.batches.qtyOnHand} > 0 then ${schema.medicines.id} end)::int`,
        })
        .from(schema.medicines)
        .leftJoin(
          schema.batches,
          and(
            eq(schema.medicines.id, schema.batches.medicineId),
            eq(schema.batches.storeId, ctx.storeId),
            eq(schema.batches.tenantId, ctx.tenantId)
          )
        )
        .where(
          and(
            eq(schema.medicines.tenantId, ctx.tenantId),
            eq(schema.medicines.isActive, true)
          )
        );

      const totalItems = Number(row?.totalItems || 0);
      const itemsInStock = Number(row?.itemsInStock || 0);
      const totalUnits = Number(row?.totalUnits || 0);
      const stockCostValue = Number(row?.stockCostValue || 0);
      const stockSaleValue = Number(row?.stockSaleValue || 0);

      return {
        report_type: reportType,
        total_items: totalItems,
        items_in_stock: itemsInStock,
        total_units: totalUnits,
        stock_cost_value_display: `₹${(stockCostValue / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        stock_sale_value_display: `₹${(stockSaleValue / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      };
    }

    if (reportType === "low_stock") {
      const rows = await db
        .select({
          name: schema.medicines.name,
          genericName: schema.medicines.genericName,
          reorderLevel: schema.medicines.reorderLevel,
          totalStock: sql<number>`coalesce(sum(${schema.batches.qtyOnHand}), 0)::int`,
        })
        .from(schema.medicines)
        .leftJoin(
          schema.batches,
          and(
            eq(schema.medicines.id, schema.batches.medicineId),
            eq(schema.batches.storeId, ctx.storeId),
            eq(schema.batches.tenantId, ctx.tenantId)
          )
        )
        .where(
          and(
            eq(schema.medicines.tenantId, ctx.tenantId),
            eq(schema.medicines.isActive, true)
          )
        )
        .groupBy(
          schema.medicines.id,
          schema.medicines.name,
          schema.medicines.genericName,
          schema.medicines.reorderLevel
        )
        .having(
          lte(
            sql`coalesce(sum(${schema.batches.qtyOnHand}), 0)`,
            sql`coalesce(${schema.medicines.reorderLevel}, 10)`
          )
        )
        .orderBy(asc(sql`coalesce(sum(${schema.batches.qtyOnHand}), 0)`))
        .limit(20);

      return {
        report_type: "low_stock",
        count: rows.length,
        items: rows.map((r) => ({
          name: r.name,
          generic_composition: r.genericName,
          total_stock: Number(r.totalStock),
          reorder_level: Number(r.reorderLevel || 10),
        })),
        message:
          rows.length > 0
            ? `Found ${rows.length} items below reorder level.`
            : "All items are above reorder level.",
      };
    }

    // Near expiry (90 days)
    const thresholdDateStr = format(addDays(new Date(), 90), "yyyy-MM-dd");

    const rows = await db
      .select({
        name: schema.medicines.name,
        batchNo: schema.batches.batchNo,
        expiryDate: schema.batches.expiryDate,
        qtyOnHand: schema.batches.qtyOnHand,
      })
      .from(schema.batches)
      .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
      .where(
        and(
          eq(schema.batches.storeId, ctx.storeId),
          eq(schema.batches.tenantId, ctx.tenantId),
          gt(schema.batches.qtyOnHand, 0),
          lte(schema.batches.expiryDate, thresholdDateStr)
        )
      )
      .orderBy(asc(schema.batches.expiryDate))
      .limit(20);

    return {
      report_type: "near_expiry",
      count: rows.length,
      items: rows.map((r) => ({
        name: r.name,
        batch_no: r.batchNo,
        expiry_date: r.expiryDate,
        qty_on_hand: Number(r.qtyOnHand),
      })),
      message:
        rows.length > 0
          ? `Found ${rows.length} batches expiring within 90 days.`
          : "No batches expiring within 90 days.",
    };
  },
};
