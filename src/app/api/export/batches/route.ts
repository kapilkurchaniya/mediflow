import { db, schema } from "@/server/db";
import { eq, and, desc, sql, lte } from "drizzle-orm";
import { requireAuth } from "@/server/auth";
import { format, addDays } from "date-fns";

export async function GET(request: Request) {
  try {
    const { session } = await requireAuth();
    const { searchParams } = new URL(request.url);
    const nearExpiry = searchParams.get("nearExpiry") === "true";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const conditions = [
      eq(schema.batches.tenantId, session.tenantId),
      eq(schema.batches.storeId, session.storeId),
    ];

    if (nearExpiry) {
      const ninetyDaysFromNow = format(addDays(new Date(), 90), "yyyy-MM-dd");
      conditions.push(lte(schema.batches.expiryDate, ninetyDaysFromNow));
    } else {
      if (from) conditions.push(sql`${schema.batches.expiryDate} >= ${from}`);
      if (to) conditions.push(sql`${schema.batches.expiryDate} <= ${to}`);
    }

    const batches = await db
      .select({
        batch: schema.batches,
        medicine: schema.medicines,
      })
      .from(schema.batches)
      .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
      .where(and(...conditions))
      .orderBy(schema.batches.expiryDate);

    const csvRows: string[] = [];
    csvRows.push([
      "Medicine Name",
      "Generic Composition",
      "Batch No",
      "Expiry Date",
      "Quantity On Hand",
      "Purchase Rate PTR (₹)",
      "MRP (₹)",
      "Sale Rate (₹)",
      "Stock Valuation (₹)",
      "Status"
    ].join(","));

    for (const { batch, medicine } of batches) {
      const medName = (medicine.name || "").replace(/"/g, '""');
      const genName = (medicine.genericName || "").replace(/"/g, '""');
      const valuation = ((batch.qtyOnHand * batch.purchaseRate) / 100).toFixed(2);

      csvRows.push([
        `"${medName}"`,
        `"${genName}"`,
        `"${batch.batchNo}"`,
        `"${batch.expiryDate}"`,
        batch.qtyOnHand,
        ((batch.purchaseRate || 0) / 100).toFixed(2),
        ((batch.mrp || 0) / 100).toFixed(2),
        ((batch.saleRate || batch.mrp || 0) / 100).toFixed(2),
        valuation,
        `"${batch.status}"`
      ].join(","));
    }

    const csvContent = csvRows.join("\n");
    const filename = `batches-stock-report-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: "Failed to export batches report" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
