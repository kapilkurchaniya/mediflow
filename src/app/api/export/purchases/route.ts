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
      eq(schema.purchases.tenantId, session.tenantId),
      eq(schema.purchases.storeId, session.storeId),
    ];

    if (from) {
      conditions.push(gte(schema.purchases.invoiceDate, from));
    }
    if (to) {
      conditions.push(lte(schema.purchases.invoiceDate, to));
    }

    const purchases = await db
      .select({
        purchase: schema.purchases,
        supplier: schema.suppliers,
      })
      .from(schema.purchases)
      .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
      .where(and(...conditions))
      .orderBy(desc(schema.purchases.invoiceDate));

    const csvRows: string[] = [];
    csvRows.push([
      "GRN Purchase No",
      "Supplier Invoice No",
      "Invoice Date",
      "Supplier Name",
      "Supplier GSTIN",
      "Gross Amount (₹)",
      "Discount (₹)",
      "Taxable Value (₹)",
      "CGST (₹)",
      "SGST (₹)",
      "IGST (₹)",
      "Total Amount (₹)",
      "Status"
    ].join(","));

    for (const { purchase, supplier } of purchases) {
      const supName = (supplier?.name || "").replace(/"/g, '""');
      const gstin = supplier?.gstin || "";

      csvRows.push([
        `"${purchase.purchaseNo}"`,
        `"${purchase.supplierInvoiceNo}"`,
        `"${purchase.invoiceDate}"`,
        `"${supName}"`,
        `"${gstin}"`,
        ((purchase.grossAmount || 0) / 100).toFixed(2),
        ((purchase.discountAmount || 0) / 100).toFixed(2),
        ((purchase.taxableAmount || 0) / 100).toFixed(2),
        ((purchase.cgst || 0) / 100).toFixed(2),
        ((purchase.sgst || 0) / 100).toFixed(2),
        ((purchase.igst || 0) / 100).toFixed(2),
        ((purchase.totalAmount || 0) / 100).toFixed(2),
        `"${purchase.status}"`
      ].join(","));
    }

    const csvContent = csvRows.join("\n");
    const filename = `purchase-register-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: "Failed to export purchase register" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
