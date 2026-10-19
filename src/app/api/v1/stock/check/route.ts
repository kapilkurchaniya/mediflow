import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/server/db";
import { eq, and, sql, ilike, or } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = body.query as string;

    if (!query?.trim()) {
      return NextResponse.json({ error: "Missing 'query' in request body" }, { status: 400 });
    }

    const q = `%${query.trim().toLowerCase()}%`;

    const items = await db
      .select({
        medicineId: schema.medicines.id,
        name: schema.medicines.name,
        genericName: schema.medicines.genericName,
        mrp: schema.medicines.mrp,
        salePrice: schema.medicines.salePrice,
        unit: schema.medicines.unit,
        rxRequired: schema.medicines.rxRequired,
        totalStock: sql<number>`coalesce(sum(${schema.batches.qtyOnHand}), 0)::int`,
      })
      .from(schema.medicines)
      .leftJoin(
        schema.batches,
        and(eq(schema.batches.medicineId, schema.medicines.id), sql`${schema.batches.qtyOnHand} > 0`)
      )
      .where(or(ilike(schema.medicines.name, q), ilike(schema.medicines.genericName, q)))
      .groupBy(schema.medicines.id)
      .limit(20);

    return NextResponse.json({
      query,
      results: items.map((i) => ({
        ...i,
        inStock: i.totalStock > 0,
        mrpRupees: i.mrp ? i.mrp / 100 : null,
        salePriceRupees: i.salePrice ? i.salePrice / 100 : null,
      })),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: (err instanceof Error ? err.message : String(err)) || "Stock check failed" },
      { status: 500 }
    );
  }
}
