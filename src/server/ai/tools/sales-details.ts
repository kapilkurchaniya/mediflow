import { z } from "zod";
import { and, desc, eq, gte, ilike, lt, type SQL } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { resolveAIPeriod } from "@/lib/date-range";
import type { MediFlowAiTool } from "../types";

export const salesDetailsTool: MediFlowAiTool<{
  period?: string;
  from?: string;
  to?: string;
  invoiceNo?: string;
  limit?: number;
}> = {
  name: "get_sales_details",
  description:
    "Get detailed sales transaction list or look up specific invoices. Shows invoice number, customer name, total amount, payment status, and timestamp. Strictly protected and scoped to this store.",
  permission: "sale.view",
  isWriteAction: false,
  inputSchema: z.object({
    period: z.string().optional().describe("Time period e.g. 'today', 'yesterday', 'this week', 'this month'"),
    from: z.string().optional().describe("Custom start date YYYY-MM-DD"),
    to: z.string().optional().describe("Custom end date YYYY-MM-DD"),
    invoiceNo: z.string().optional().describe("Optional invoice number to search for"),
    limit: z.number().optional().describe("Maximum number of records to return (default 10, max 25)"),
  }),
  execute: async (ctx, { period, from, to, invoiceNo, limit = 10 }) => {
    if (!ctx.storeId) {
      return { error: "Active store session required to access sales records." };
    }

    const dateRange =
      from || to
        ? { from: from || null, to: to || null }
        : period
          ? resolveAIPeriod(period)
          : { from: null, to: null };

    const conditions: SQL[] = [
      eq(schema.sales.storeId, ctx.storeId),
      eq(schema.sales.tenantId, ctx.tenantId),
    ];

    if (invoiceNo) {
      conditions.push(ilike(schema.sales.invoiceNo, `%${invoiceNo.trim()}%`));
    }
    if (dateRange.from) {
      conditions.push(gte(schema.sales.createdAt, new Date(`${dateRange.from}T00:00:00Z`)));
    }
    if (dateRange.to) {
      conditions.push(lt(schema.sales.createdAt, new Date(`${dateRange.to}T23:59:59.999Z`)));
    }

    const maxLimit = Math.min(Math.max(1, limit || 10), 25);

    const rows = await db
      .select({
        id: schema.sales.id,
        invoiceNo: schema.sales.invoiceNo,
        totalAmount: schema.sales.totalAmount,
        paidAmount: schema.sales.paidAmount,
        status: schema.sales.status,
        createdAt: schema.sales.createdAt,
        customerName: schema.sales.customerName,
      })
      .from(schema.sales)
      .where(and(...conditions))
      .orderBy(desc(schema.sales.createdAt))
      .limit(maxLimit);

    const invoices = rows.map((r) => ({
      invoice_no: r.invoiceNo || "N/A",
      customer_name: r.customerName || "Walk-in customer",
      amount_rupees: `₹${(Number(r.totalAmount || 0) / 100).toFixed(2)}`,
      paid_rupees: `₹${(Number(r.paidAmount || 0) / 100).toFixed(2)}`,
      status: r.status,
      created_at: r.createdAt ? new Date(r.createdAt).toLocaleString("en-IN") : "N/A",
    }));

    return {
      period: period || "custom/recent",
      count: invoices.length,
      invoices,
      protection_notice: "Protected store-scoped live sales records.",
    };
  },
};
