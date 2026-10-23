import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/server/db";
import { eq, and, sql, ilike, or, gt, lt } from "drizzle-orm";
import { authenticateApiKey, apiError } from "@/server/api-auth";

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  let auth: Awaited<ReturnType<typeof authenticateApiKey>>;
  try {
    auth = await authenticateApiKey(req, "stock.read");
  } catch (e) {
    return apiError(e);
  }

  // ── Input ────────────────────────────────────────────────────────────────
  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "Missing 'query' in request body" }, { status: 400 });
  }

  const q = `%${query.toLowerCase()}%`;

  // ── Query — tenant-scoped, store-scoped if key has a store ───────────────
  try {
    const batchConditions = [
      eq(schema.batches.medicineId, schema.medicines.id),
      gt(schema.batches.qtyOnHand, 0),
      // Exclude expired batches (expiryDate < today)
      sql`${schema.batches.expiryDate} > current_date`,
    ];

    // If the API key is scoped to a specific store, only show that store's stock
    if (auth.storeId) {
      batchConditions.push(eq(schema.batches.storeId, auth.storeId));
    }

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
      .leftJoin(schema.batches, and(...batchConditions))
      .where(
        and(
          // Tenant isolation — key can only see its own catalogue
          eq(schema.medicines.tenantId, auth.tenantId),
          or(ilike(schema.medicines.name, q), ilike(schema.medicines.genericName, q)),
        ),
      )
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
  } catch (e) {
    return apiError(e);
  }
}
