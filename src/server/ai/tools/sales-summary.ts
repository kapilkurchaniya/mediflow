import { z } from "zod";
import { and, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { resolveAIPeriod } from "@/lib/date-range";
import type { MediFlowAiTool } from "../types";

export const salesSummaryTool: MediFlowAiTool<{
  period: string;
  from?: string;
  to?: string;
}> = {
  name: "get_sales_summary",
  description:
    "Get a summary of sales and revenue for a given period (today, yesterday, this week, this month, this year, or custom date range). Strictly scoped to this store.",
  permission: "sale.view",
  isWriteAction: false,
  inputSchema: z.object({
    period: z
      .string()
      .describe(
        "The time period for the sales summary (e.g., 'today', 'this week', 'this month', 'last month', 'this year', 'yesterday')"
      ),
    from: z.string().optional().describe("Optional custom start date in YYYY-MM-DD format"),
    to: z.string().optional().describe("Optional custom end date in YYYY-MM-DD format"),
  }),
  execute: async (ctx, { period, from, to }) => {
    if (!ctx.storeId) {
      return { error: "Active store session required to access sales summary." };
    }

    const dateRange = from && to ? { from, to } : resolveAIPeriod(period);

    const conditions: SQL[] = [
      eq(schema.sales.storeId, ctx.storeId),
      eq(schema.sales.tenantId, ctx.tenantId),
      eq(schema.sales.status, "completed"),
    ];

    if (dateRange.from) {
      conditions.push(gte(schema.sales.createdAt, new Date(`${dateRange.from}T00:00:00Z`)));
    }
    if (dateRange.to) {
      conditions.push(lt(schema.sales.createdAt, new Date(`${dateRange.to}T23:59:59.999Z`)));
    }

    const [row] = await db
      .select({
        totalRevenue: sql<number>`coalesce(sum(${schema.sales.totalAmount}), 0)::int`,
        totalInvoices: sql<number>`count(${schema.sales.id})::int`,
        avgOrderValue: sql<number>`coalesce(avg(${schema.sales.totalAmount}), 0)::int`,
        totalCost: sql<number>`coalesce(sum(${schema.sales.costAmount}), 0)::int`,
        totalCredit: sql<number>`coalesce(sum(${schema.sales.creditAmount}), 0)::int`,
      })
      .from(schema.sales)
      .where(and(...conditions));

    const totalRevenue = Number(row?.totalRevenue || 0);
    const totalInvoices = Number(row?.totalInvoices || 0);
    const avgOrderValue = Number(row?.avgOrderValue || 0);
    const totalCredit = Number(row?.totalCredit || 0);

    return {
      period,
      date_range: `${dateRange.from || "all time"} to ${dateRange.to || "now"}`,
      total_revenue: totalRevenue,
      total_revenue_display: `₹${(totalRevenue / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      total_invoices: totalInvoices,
      average_order_value: avgOrderValue,
      average_order_value_display: `₹${(avgOrderValue / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      total_credit_outstanding: totalCredit,
      total_credit_display: `₹${(totalCredit / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      currency: "INR",
      message:
        totalInvoices > 0
          ? `Found ${totalInvoices} invoices for ${period}.`
          : `No sales found for ${period}.`,
    };
  },
};

