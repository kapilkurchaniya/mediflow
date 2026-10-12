import { db, schema } from "@/server/db";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { format } from "date-fns";

export async function GET(request: Request) {
  try {
    const { session } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const conditions = [
      eq(schema.sales.tenantId, session.tenantId),
      eq(schema.sales.storeId, session.storeId),
    ];

    if (from) {
      conditions.push(gte(schema.sales.createdAt, new Date(from + "T00:00:00")));
    }
    if (to) {
      conditions.push(lte(schema.sales.createdAt, new Date(to + "T23:59:59.999")));
    }

    const sales = await db
      .select({
        sale: schema.sales,
        customer: schema.customers,
      })
      .from(schema.sales)
      .leftJoin(schema.customers, eq(schema.sales.customerId, schema.customers.id))
      .where(and(...conditions))
      .orderBy(desc(schema.sales.createdAt));

    const csvRows: string[] = [];
    // Header
    csvRows.push([
      "Invoice No",
      "Date",
      "Time",
      "Customer Name",
      "Customer Phone",
      "Doctor Name",
      "Taxable (₹)",
      "CGST (₹)",
      "SGST (₹)",
      "IGST (₹)",
      "Round Off (₹)",
      "Total Amount (₹)",
      "Paid Amount (₹)",
      "Credit Amount (₹)",
      "Status"
    ].join(","));

    for (const { sale, customer } of sales) {
      const dateStr = format(new Date(sale.completedAt ?? sale.createdAt!), "yyyy-MM-dd");
      const timeStr = format(new Date(sale.completedAt ?? sale.createdAt!), "HH:mm:ss");
      const custName = (customer?.name || sale.customerName || "Walk-in").replace(/"/g, '""');
      const custPhone = customer?.phone || "";
      const doc = (sale.doctorName || "").replace(/"/g, '""');

      csvRows.push([
        `"${sale.invoiceNo}"`,
        `"${dateStr}"`,
        `"${timeStr}"`,
        `"${custName}"`,
        `"${custPhone}"`,
        `"${doc}"`,
        ((sale.taxableAmount || 0) / 100).toFixed(2),
        ((sale.cgst || 0) / 100).toFixed(2),
        ((sale.sgst || 0) / 100).toFixed(2),
        ((sale.igst || 0) / 100).toFixed(2),
        ((sale.roundOff || 0) / 100).toFixed(2),
        ((sale.totalAmount || 0) / 100).toFixed(2),
        ((sale.paidAmount || 0) / 100).toFixed(2),
        ((sale.creditAmount || 0) / 100).toFixed(2),
        `"${sale.status}"`
      ].join(","));
    }

    const csvContent = csvRows.join("\n");
    const filename = `sales-register-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: "Failed to export sales register" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
