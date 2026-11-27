import { sql } from "drizzle-orm";
import { format } from "date-fns";
import { schema, type DbOrTx } from "@/server/db";
import type { AuthCtx } from "@/server/rbac";

export interface PosSearchResultItem {
  medicine: typeof schema.medicines.$inferSelect & {
    rackCode: string | null;
    rackName: string | null;
  };
  batches: (typeof schema.batches.$inferSelect)[];
}

function escapeLikeToken(token: string): string {
  return token.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Builds PostgreSQL ILIKE patterns that match multi-word pharmacy queries
 * (e.g. "dolo 650" -> "%dolo%650%" matching "Dolo-650", "Dolo 650mg", etc.).
 */
export function buildPosSearchPatterns(trimmedQuery: string): {
  lowerQuery: string;
  pattern: string;
  prefixPattern: string;
} {
  const lowerQuery = trimmedQuery.toLowerCase();
  const tokens = lowerQuery.split(/\s+/).filter(Boolean).map(escapeLikeToken);
  const joined = tokens.join("%");
  return {
    lowerQuery,
    pattern: `%${joined}%`,
    prefixPattern: `${joined}%`,
  };
}

interface RawBatchJson {
  id: string;
  tenantId: string;
  storeId: string;
  medicineId: string;
  batchNo: string;
  expiryDate: string;
  mfgDate: string | null;
  purchaseRate: number;
  mrp: number;
  saleRate: number;
  supplierId: string | null;
  qtyOnHand: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface RawSearchRow {
  id: string;
  tenant_id: string;
  name: string;
  generic_name: string | null;
  composition: string | null;
  strength: string | null;
  dosage_form: string | null;
  pack_size: string | null;
  unit: string;
  units_per_pack: number;
  pack_unit: string;
  loose_unit: string;
  manufacturer_id: string | null;
  category_id: string | null;
  target_segment: string | null;
  barcode: string | null;
  hsn: string | null;
  gst_rate_bp: number;
  mrp: number;
  sale_price: number;
  purchase_price: number;
  rx_required: boolean;
  schedule: string;
  reorder_level: number;
  max_stock: number;
  is_active: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  rack_code: string | null;
  rack_name: string | null;
  sale_price_override: number | null;
  batches: RawBatchJson[];
}

/**
 * High-performance single-query POS medicine & in-stock batch search.
 * Uses index-matched predicates (`medicines_name_trgm`, `medicines_generic_trgm`,
 * `medicines_tenant_barcode_uq`) and `batches_store_med_active_idx` via LATERAL join.
 */
export async function searchPosMedicines(
  database: DbOrTx,
  ctx: Pick<AuthCtx, "tenantId" | "storeId">,
  query: string,
  limit: number = 25,
): Promise<PosSearchResultItem[]> {
  const trimmed = query?.trim() ?? "";
  if (trimmed.length < 2) return [];

  const { lowerQuery, pattern, prefixPattern } = buildPosSearchPatterns(trimmed);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const result = await database.execute(sql`
    WITH matched AS (
      SELECT
        m.id,
        m.tenant_id,
        m.name,
        m.generic_name,
        m.composition,
        m.strength,
        m.dosage_form,
        m.pack_size,
        m.unit,
        m.units_per_pack,
        m.pack_unit,
        m.loose_unit,
        m.manufacturer_id,
        m.category_id,
        m.barcode,
        m.hsn,
        m.gst_rate_bp,
        m.mrp,
        m.sale_price,
        m.purchase_price,
        m.rx_required,
        m.schedule,
        m.reorder_level,
        m.max_stock,
        m.is_active,
        m.created_at,
        m.updated_at,
        r.code AS rack_code,
        r.name AS rack_name,
        sms.sale_price_override,
        (CASE
          WHEN m.barcode = ${trimmed} THEN 0
          WHEN lower(m.name) = ${lowerQuery} THEN 1
          WHEN m.name ILIKE ${prefixPattern} THEN 2
          WHEN coalesce(m.generic_name, '') ILIKE ${prefixPattern} THEN 3
          WHEN m.name ILIKE ${pattern} THEN 4
          ELSE 5
        END) AS rank
      FROM medicines m
      LEFT JOIN store_medicine_settings sms
        ON sms.medicine_id = m.id
        AND sms.store_id = ${ctx.storeId}
        AND sms.tenant_id = ${ctx.tenantId}
      LEFT JOIN racks r
        ON r.id = sms.rack_id
        AND r.store_id = ${ctx.storeId}
        AND r.tenant_id = ${ctx.tenantId}
      WHERE m.tenant_id = ${ctx.tenantId}
        AND m.is_active = true
        AND (
          m.name ILIKE ${pattern}
          OR coalesce(m.generic_name, '') ILIKE ${pattern}
          OR m.barcode = ${trimmed}
        )
      ORDER BY rank ASC, m.name ASC
      LIMIT ${limit}
    )
    SELECT
      matched.*,
      COALESCE(b_agg.batches, '[]'::json) AS batches
    FROM matched
    LEFT JOIN LATERAL (
      SELECT json_agg(
        json_build_object(
          'id', b.id,
          'tenantId', b.tenant_id,
          'storeId', b.store_id,
          'medicineId', b.medicine_id,
          'batchNo', b.batch_no,
          'expiryDate', b.expiry_date,
          'mfgDate', b.mfg_date,
          'purchaseRate', b.purchase_rate,
          'mrp', b.mrp,
          'saleRate', b.sale_rate,
          'supplierId', b.supplier_id,
          'qtyOnHand', b.qty_on_hand,
          'status', b.status,
          'createdAt', b.created_at,
          'updatedAt', b.updated_at
        )
        ORDER BY b.expiry_date ASC, b.id ASC
      ) AS batches
      FROM batches b
      WHERE b.store_id = ${ctx.storeId}
        AND b.medicine_id = matched.id
        AND b.status = 'active'
        AND b.qty_on_hand > 0
        AND b.expiry_date > ${todayStr}
    ) b_agg ON true
    ORDER BY (b_agg.batches IS NOT NULL) DESC, matched.rank ASC, matched.name ASC
  `);

  const rows = result.rows as unknown as RawSearchRow[];

  return rows.map((row) => {
    const baseSalePrice = Number(row.sale_price ?? 0);
    const overridePrice =
      row.sale_price_override !== null && row.sale_price_override !== undefined
        ? Number(row.sale_price_override)
        : null;

    const batches = (Array.isArray(row.batches) ? row.batches : []).map((b) => ({
      id: b.id,
      tenantId: b.tenantId,
      storeId: b.storeId,
      medicineId: b.medicineId,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate,
      mfgDate: b.mfgDate ?? null,
      purchaseRate: Number(b.purchaseRate ?? 0),
      mrp: Number(b.mrp ?? 0),
      saleRate: Number(b.saleRate ?? 0),
      supplierId: b.supplierId ?? null,
      qtyOnHand: Number(b.qtyOnHand),
      status: b.status,
      createdAt: new Date(b.createdAt),
      updatedAt: new Date(b.updatedAt),
    }));

    return {
      medicine: {
        id: row.id,
        tenantId: row.tenant_id,
        name: row.name,
        genericName: row.generic_name ?? null,
        composition: row.composition ?? null,
        strength: row.strength ?? null,
        dosageForm: row.dosage_form ?? null,
        packSize: row.pack_size ?? null,
        unit: row.unit,
        unitsPerPack: Number(row.units_per_pack),
        packUnit: row.pack_unit,
        looseUnit: row.loose_unit,
        manufacturerId: row.manufacturer_id ?? null,
        categoryId: row.category_id ?? null,
        targetSegment: row.target_segment ?? "general",
        barcode: row.barcode ?? null,
        hsn: row.hsn ?? null,
        gstRateBp: Number(row.gst_rate_bp),
        mrp: Number(row.mrp ?? 0),
        salePrice: overridePrice !== null ? overridePrice : baseSalePrice,
        purchasePrice: Number(row.purchase_price ?? 0),
        rxRequired: Boolean(row.rx_required),
        schedule: row.schedule,
        reorderLevel: Number(row.reorder_level),
        maxStock: Number(row.max_stock),
        isActive: Boolean(row.is_active),
        createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
        updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
        rackCode: row.rack_code ?? null,
        rackName: row.rack_name ?? null,
      },
      batches,
    };
  });
}
