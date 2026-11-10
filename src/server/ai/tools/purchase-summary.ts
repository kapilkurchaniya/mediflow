import { z } from "zod";
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { resolveAIPeriod } from "@/lib/date-range";
import type { MediFlowAiTool } from "../types";

export const purchaseSummaryTool: MediFlowAiTool<{
  period: string;
  from?: string;
  to?: string;
}> = {
  name: "get_purchase_summary",
  description:
    "Get a summary of purchases for a given period. Shows total purchase value, number of invoices, amount paid, and outstanding balances.",
  permission: "purchase.view",
  isWriteAction: false,
  inputSchema: z.object({
    period: z
      .string()
      .describe("The time period (e.g., 'today', 'this week', 'this month', 'last month', 'this year')"),
    from: z.string().optional().describe("Optional custom start date YYYY-MM-DD"),
    to: z.string().optional().describe("Optional custom end date YYYY-MM-DD"),
  }),
  execute: async (ctx, { period, from, to }) => {
    if (!ctx.storeId) {
      return { error: "Active store session required to access purchase summary." };
    }

    const dateRange = from && to ? { from, to } : resolveAIPeriod(period);

    const conditions: SQL[] = [
      eq(schema.purchases.storeId, ctx.storeId),
      eq(schema.purchases.tenantId, ctx.tenantId),
      eq(schema.purchases.status, "posted"),
    ];

    if (dateRange.from) {
      conditions.push(gte(schema.purchases.invoiceDate, dateRange.from));
    }
    if (dateRange.to) {
      conditions.push(lte(schema.purchases.invoiceDate, dateRange.to));
    }

    const [row] = await db
      .select({
        totalPurchases: sql<number>`coalesce(sum(${schema.purchases.totalAmount}), 0)::int`,
        totalInvoices: sql<number>`count(${schema.purchases.id})::int`,
        totalPaid: sql<number>`coalesce(sum(${schema.purchases.paidAmount}), 0)::int`,
        outstanding: sql<number>`coalesce(sum(${schema.purchases.totalAmount}) - sum(${schema.purchases.paidAmount}), 0)::int`,
      })
      .from(schema.purchases)
      .where(and(...conditions));

    const totalPurchases = Number(row?.totalPurchases || 0);
    const totalInvoices = Number(row?.totalInvoices || 0);
    const totalPaid = Number(row?.totalPaid || 0);
    const outstanding = Number(row?.outstanding || 0);

    return {
      period,
      date_range: `${dateRange.from || "all time"} to ${dateRange.to || "now"}`,
      total_purchases: totalPurchases,
      total_purchases_display: `₹${(totalPurchases / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      total_invoices: totalInvoices,
      total_paid_display: `₹${(totalPaid / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      outstanding_display: `₹${(outstanding / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      currency: "INR",
      message: `Found ${totalInvoices} purchase invoices for ${period}.`,
    };
  },
};

