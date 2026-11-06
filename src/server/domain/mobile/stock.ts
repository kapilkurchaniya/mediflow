/** Multi-Store Stock & Batch Lookup for Mobile (Lane A: A5.7.4) */
import { sql } from "drizzle-orm";
import { db as defaultDb } from "../../db";

export interface MobileStockItem {
  medicineId: string;
  name: string;
  composition: string | null;
  barcode: string | null;
  schedule: string | null;
  packUnit: string | null;
  totalQtyOnHand: number;
  stores: {
    storeId: string;
    storeName: string;
    storeCode: string;
    batches: {
      batchId: string;
      batchNo: string;
      expiryDate: string;
      qtyOnHand: number;
      mrpPaise: number | null;
      saleRatePaise: number | null;
    }[];
  }[];
}

export type MobileBatchItem = MobileStockItem["stores"][number]["batches"][number];

export async function lookupMobileStock(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    query?: string;
    barcode?: string;
    storeId?: string;
    allowedStoreIds: string[];
    allStores: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<{ items: MobileStockItem[]; totalCount: number }> {
  const limit = Math.min(Math.max(Number(input.limit || 20), 1), 50);
  const offset = Math.max(Number(input.offset || 0), 0);

  // Validate store access
  if (input.storeId && !input.allStores && !input.allowedStoreIds.includes(input.storeId)) {
    throw new Error("STORE_ACCESS_DENIED: User does not have access to requested store");
  }

  const storeFilter = input.storeId
    ? sql`AND b.store_id = ${input.storeId}::uuid`
    : input.allStores
      ? sql``
      : input.allowedStoreIds.length > 0
        ? sql`AND b.store_id = ANY(ARRAY[${sql.join(input.allowedStoreIds.map((id) => sql`${id}::uuid`), sql`, `)}])`
        : sql`AND 1=0`;

  let searchFilter = sql`1=1`;
  if (input.barcode) {
    searchFilter = sql`m.barcode = ${input.barcode.trim()}`;
  } else if (input.query && input.query.trim().length > 0) {
    const q = `%${input.query.trim()}%`;
    searchFilter = sql`(m.name ILIKE ${q} OR m.composition ILIKE ${q} OR m.barcode = ${input.query.trim()})`;
  }

  // 1. Get matching medicines with pagination
  const medRows = await db.execute(sql`
    SELECT m.id, m.name, m.composition, m.barcode, m.schedule, m.pack_unit,
           COUNT(*) OVER() AS full_count
    FROM medicines m
    WHERE m.tenant_id = ${input.tenantId}::uuid
      AND ${searchFilter}
    ORDER BY m.name ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  if (medRows.rows.length === 0) {
    return { items: [], totalCount: 0 };
  }

  const totalCount = Number((medRows.rows[0] as Record<string, unknown>)?.full_count || 0);
  const medIds = medRows.rows.map((r) => (r as Record<string, unknown>).id as string);

  // 2. Fetch active batches across authorized stores (strict omission of purchase costs/suppliers)
  const batchRows = await db.execute(sql`
    SELECT b.id AS batch_id, b.medicine_id, b.store_id, b.batch_no, b.expiry_date,
           b.qty_on_hand, b.mrp, b.sale_rate,
           st.name AS store_name, st.code AS store_code
    FROM batches b
    JOIN stores st ON b.tenant_id = st.tenant_id AND b.store_id = st.id
    WHERE b.tenant_id = ${input.tenantId}::uuid
      AND b.medicine_id = ANY(ARRAY[${sql.join(medIds.map((id) => sql`${id}::uuid`), sql`, `)}])
      AND b.status = 'active'
      AND b.qty_on_hand > 0
      ${storeFilter}
    ORDER BY st.name ASC, b.expiry_date ASC
  `);

  // Group batches by medicine and store
  const batchesByMed: Record<string, Record<string, { storeName: string; storeCode: string; batches: MobileBatchItem[] }>> = {};
  for (const row of batchRows.rows) {
    const b = row as Record<string, unknown>;
    const medId = b.medicine_id as string;
    const storeId = b.store_id as string;
    if (!batchesByMed[medId]) batchesByMed[medId] = {};
    if (!batchesByMed[medId][storeId]) {
      batchesByMed[medId][storeId] = {
        storeName: b.store_name as string,
        storeCode: b.store_code as string,
        batches: [],
      };
    }
    const expDate = typeof b.expiry_date === "object" && b.expiry_date !== null
      ? (b.expiry_date as Date).toISOString().slice(0, 10)
      : String(b.expiry_date);
    batchesByMed[medId][storeId].batches.push({
      batchId: b.batch_id as string,
      batchNo: b.batch_no as string,
      expiryDate: expDate,
      qtyOnHand: Number(b.qty_on_hand),
      mrpPaise: b.mrp !== null ? Number(b.mrp) : null,
      saleRatePaise: b.sale_rate !== null ? Number(b.sale_rate) : null,
    });
  }

  const items: MobileStockItem[] = medRows.rows.map((row) => {
    const m = row as Record<string, unknown>;
    const medId = m.id as string;
    const medStoresMap = batchesByMed[medId] || {};
    const storesList = Object.entries(medStoresMap).map(([storeId, sData]) => ({
      storeId,
      storeName: sData.storeName,
      storeCode: sData.storeCode,
      batches: sData.batches,
    }));

    const totalQtyOnHand = storesList.reduce(
      (tot, s) => tot + s.batches.reduce((sTot, b) => sTot + b.qtyOnHand, 0),
      0,
    );

    return {
      medicineId: medId,
      name: m.name as string,
      composition: (m.composition as string) || null,
      barcode: (m.barcode as string) || null,
      schedule: (m.schedule as string) || null,
      packUnit: (m.pack_unit as string) || null,
      totalQtyOnHand,
      stores: storesList,
    };
  });

  return { items, totalCount };
}
