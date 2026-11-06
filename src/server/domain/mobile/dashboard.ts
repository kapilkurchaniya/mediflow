/** Mobile Owner Dashboard & Real-Time Financial Reporting (Lane A: A5.7.3) */
import { sql } from "drizzle-orm";
import { db as defaultDb } from "../../db";

export interface MobileDashboardMetrics {
  businessDate: string; // YYYY-MM-DD in Asia/Kolkata
  windowUtc: { start: string; end: string };
  storeScope: { isAllStores: boolean; storeId?: string };
  sales: {
    grossSalesPaise: number;
    returnsPaise: number;
    netSalesPaise: number;
    landedCostPaise: number;
    grossMarginPaise: number;
    grossMarginBp: number;
  };
  collections: {
    cashCollectionsPaise: number;
    digitalCollectionsPaise: number;
    upiCollectionsPaise: number;
    cardCollectionsPaise: number;
    totalCollectionsPaise: number;
  };
  receivables: {
    periodCreditSalesPaise: number;
    cumulativeOutstandingArPaise: number;
    customerAdvancesPaise: number;
  };
}

export function getKolkataTimeWindow(dateStr?: string): {
  businessDate: string;
  dayStartUtc: Date;
  nextDayStartUtc: Date;
} {
  const now = new Date();
  const kolkataDate =
    dateStr ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

  const [year, month, day] = kolkataDate.split("-").map(Number);
  // Midnight in Asia/Kolkata is UTC 18:30 of previous calendar day (UTC+5:30)
  const dayStartUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - (5 * 60 + 30) * 60 * 1000);
  const nextDayStartUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

  return { businessDate: kolkataDate, dayStartUtc, nextDayStartUtc };
}

export async function getMobileDashboardMetrics(
  db: typeof defaultDb,
  input: {
    tenantId: string;
    storeId?: string;
    dateStr?: string;
  },
): Promise<MobileDashboardMetrics> {
  const { businessDate, dayStartUtc, nextDayStartUtc } = getKolkataTimeWindow(input.dateStr);

  const storeFilter = input.storeId
    ? sql`AND s.store_id = ${input.storeId}::uuid`
    : sql``;
  const paymentStoreFilter = input.storeId
    ? sql`AND p.store_id = ${input.storeId}::uuid`
    : sql``;
  const returnStoreFilter = input.storeId
    ? sql`AND sr.store_id = ${input.storeId}::uuid`
    : sql``;

  // 1. Sales & Margins (Sales completed within sargable half-open UTC window)
  const salesRes = await db.execute(sql`
    SELECT
      COALESCE(SUM(s.total_amount), 0)::bigint AS gross_sales,
      COALESCE(SUM(s.cost_amount), 0)::bigint AS landed_cost,
      COALESCE(SUM(s.credit_amount), 0)::bigint AS credit_sales
    FROM sales s
    WHERE s.tenant_id = ${input.tenantId}::uuid
      AND s.completed_at >= ${dayStartUtc.toISOString()}::timestamptz
      AND s.completed_at < ${nextDayStartUtc.toISOString()}::timestamptz
      AND s.status = 'completed'
      AND s.cancelled_at IS NULL
      ${storeFilter}
  `);

  // 2. Returns in reporting window
  const returnsRes = await db.execute(sql`
    SELECT
      COALESCE(SUM(sr.total_amount), 0)::bigint AS returns_total
    FROM sale_returns sr
    WHERE sr.tenant_id = ${input.tenantId}::uuid
      AND sr.created_at >= ${dayStartUtc.toISOString()}::timestamptz
      AND sr.created_at < ${nextDayStartUtc.toISOString()}::timestamptz
      ${returnStoreFilter}
  `);

  // 3. Collections from posted payments ledger
  const collectionsRes = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN p.method = 'cash' THEN p.amount ELSE 0 END), 0)::bigint AS cash_coll,
      COALESCE(SUM(CASE WHEN p.method = 'upi' THEN p.amount ELSE 0 END), 0)::bigint AS upi_coll,
      COALESCE(SUM(CASE WHEN p.method = 'card' THEN p.amount ELSE 0 END), 0)::bigint AS card_coll,
      COALESCE(SUM(CASE WHEN p.method IN ('upi', 'card') THEN p.amount ELSE 0 END), 0)::bigint AS digital_coll,
      COALESCE(SUM(p.amount), 0)::bigint AS total_coll
    FROM payments p
    WHERE p.tenant_id = ${input.tenantId}::uuid
      AND p.direction = 'in'
      AND p.created_at >= ${dayStartUtc.toISOString()}::timestamptz
      AND p.created_at < ${nextDayStartUtc.toISOString()}::timestamptz
      ${paymentStoreFilter}
  `);

  // 4. Cumulative Outstanding Receivables (AR) across ALL historical invoices as of cutoff
  const receivablesRes = await db.execute(sql`
    SELECT
      COALESCE(SUM(s.total_amount - s.paid_amount - COALESCE(s.returned_amount, 0)), 0)::bigint AS outstanding_ar
    FROM sales s
    WHERE s.tenant_id = ${input.tenantId}::uuid
      AND s.completed_at < ${nextDayStartUtc.toISOString()}::timestamptz
      AND s.status = 'completed'
      AND s.cancelled_at IS NULL
      AND (s.total_amount - s.paid_amount - COALESCE(s.returned_amount, 0)) > 0
      ${storeFilter}
  `);

  // 5. Customer Advances in period
  const advancesRes = await db.execute(sql`
    SELECT
      COALESCE(SUM(p.amount), 0)::bigint AS advances_total
    FROM payments p
    WHERE p.tenant_id = ${input.tenantId}::uuid
      AND p.direction = 'in'
      AND p.created_at >= ${dayStartUtc.toISOString()}::timestamptz
      AND p.created_at < ${nextDayStartUtc.toISOString()}::timestamptz
      AND p.note ILIKE '%advance%'
      ${paymentStoreFilter}
  `);

  const sRow = salesRes.rows[0] as Record<string, unknown> | undefined;
  const rRow = returnsRes.rows[0] as Record<string, unknown> | undefined;
  const cRow = collectionsRes.rows[0] as Record<string, unknown> | undefined;
  const arRow = receivablesRes.rows[0] as Record<string, unknown> | undefined;
  const advRow = advancesRes.rows[0] as Record<string, unknown> | undefined;

  const grossSalesPaise = Number(sRow?.gross_sales || 0);
  const returnsPaise = Number(rRow?.returns_total || 0);
  const netSalesPaise = Math.max(0, grossSalesPaise - returnsPaise);
  const landedCostPaise = Number(sRow?.landed_cost || 0);
  const grossMarginPaise = netSalesPaise - landedCostPaise;
  const grossMarginBp = netSalesPaise > 0 ? Math.round((grossMarginPaise / netSalesPaise) * 10000) : 0;

  const cashCollectionsPaise = Number(cRow?.cash_coll || 0);
  const upiCollectionsPaise = Number(cRow?.upi_coll || 0);
  const cardCollectionsPaise = Number(cRow?.card_coll || 0);
  const digitalCollectionsPaise = Number(cRow?.digital_coll || 0);
  const totalCollectionsPaise = Number(cRow?.total_coll || 0);

  const periodCreditSalesPaise = Number(sRow?.credit_sales || 0);
  const cumulativeOutstandingArPaise = Number(arRow?.outstanding_ar || 0);
  const customerAdvancesPaise = Number(advRow?.advances_total || 0);

  return {
    businessDate,
    windowUtc: {
      start: dayStartUtc.toISOString(),
      end: nextDayStartUtc.toISOString(),
    },
    storeScope: {
      isAllStores: !input.storeId,
      storeId: input.storeId,
    },
    sales: {
      grossSalesPaise,
      returnsPaise,
      netSalesPaise,
      landedCostPaise,
      grossMarginPaise,
      grossMarginBp,
    },
    collections: {
      cashCollectionsPaise,
      digitalCollectionsPaise,
      upiCollectionsPaise,
      cardCollectionsPaise,
      totalCollectionsPaise,
    },
    receivables: {
      periodCreditSalesPaise,
      cumulativeOutstandingArPaise,
      customerAdvancesPaise,
    },
  };
}
