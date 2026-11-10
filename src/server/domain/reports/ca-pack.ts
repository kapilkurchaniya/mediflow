import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { schema } from "@/server/db";
import { buildGstr1Data, buildGstr1JsonPayload } from "@/server/domain/gst";
import { generateProfitAndLoss, generateTrialBalance } from "@/server/domain/reports";

export interface CaMonthEndPackParams {
  tenantId: string;
  monthString: string; // "YYYY-MM"
  storeId?: string;
}

export interface CaPurchaseRegisterRow {
  invoiceNumber: string;
  invoiceDate: string;
  supplierName: string;
  supplierGstin: string;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
  itcEligible: boolean;
}

export interface CaSalesRegisterRow {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerGstin: string;
  saleType: "B2B" | "B2C";
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface CaMonthEndPackResult {
  month: string;
  tenant: { id: string; name: string; gstin: string | null };
  storeName: string;
  gstr1Summary: {
    totalB2bTaxablePaise: number;
    totalB2cTaxablePaise: number;
    totalTaxPaise: number;
    b2bCount: number;
    b2cCount: number;
    hsnCount: number;
  };
  gstr1JsonPayload: unknown;
  purchases: CaPurchaseRegisterRow[];
  sales: CaSalesRegisterRow[];
  trialBalance: {
    totalDebitPaise: number;
    totalCreditPaise: number;
  };
  profitAndLoss: {
    revenuePaise: number;
    cogsPaise: number;
    grossProfitPaise: number;
    netProfitPaise: number;
  };
  stockValuation: {
    totalBatches: number;
    totalUnitsOnHand: number;
    valuationAtCostPaise: number;
    valuationAtMrpPaise: number;
  };
}

export async function generateCaMonthEndPack(
  db: DbOrTx,
  params: CaMonthEndPackParams,
): Promise<CaMonthEndPackResult> {
  const { tenantId, monthString, storeId } = params;
  const [yearStr, monthStr] = monthString.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const [tenant] = await db
    .select({ id: schema.tenants.id, name: schema.tenants.name, gstin: schema.tenants.gstin })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  if (!tenant) throw new Error("Tenant not found");

  const [store] = storeId
    ? await db.select({ name: schema.stores.name }).from(schema.stores).where(eq(schema.stores.id, storeId)).limit(1)
    : [{ name: "All Branches Consolidated" }];

  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // 1. GSTR-1 Data & Official JSON Payload
  const gstr1 = await buildGstr1Data(db, {
    tenantId,
    month,
    year,
    storeId,
    gstin: tenant.gstin || undefined,
  });

  const gstr1JsonPayload = buildGstr1JsonPayload(gstr1, tenant.gstin || "27AABCU9603R1ZM");

  const b2bTaxable = gstr1.b2b.reduce((acc, row) => acc + row.taxableAmount, 0);
  const b2cTaxable = gstr1.b2cs.reduce((acc, row) => acc + row.taxableAmount, 0);
  const totalTax = gstr1.hsnSummary.reduce((acc, row) => acc + row.cgst + row.sgst + row.igst, 0);

  // 2. Inward Purchase Register (with ITC classification)
  const purchaseQueryConditions = [
    eq(schema.purchases.tenantId, tenantId),
    gte(schema.purchases.invoiceDate, fromDate),
    lte(schema.purchases.invoiceDate, toDate),
  ];
  if (storeId) purchaseQueryConditions.push(eq(schema.purchases.storeId, storeId));

  const purchaseRecords = await db
    .select({
      invoiceNumber: schema.purchases.supplierInvoiceNo,
      invoiceDate: schema.purchases.invoiceDate,
      supplierName: schema.suppliers.name,
      supplierGstin: schema.suppliers.gstin,
      subtotal: schema.purchases.taxableAmount,
      cgst: schema.purchases.cgst,
      sgst: schema.purchases.sgst,
      igst: schema.purchases.igst,
      total: schema.purchases.totalAmount,
    })
    .from(schema.purchases)
    .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
    .where(and(...purchaseQueryConditions));

  const purchases: CaPurchaseRegisterRow[] = purchaseRecords.map((p) => ({
    invoiceNumber: p.invoiceNumber,
    invoiceDate: p.invoiceDate,
    supplierName: p.supplierName,
    supplierGstin: p.supplierGstin || "Unregistered",
    taxableAmountPaise: p.subtotal || 0,
    cgstPaise: p.cgst || 0,
    sgstPaise: p.sgst || 0,
    igstPaise: p.igst || 0,
    totalPaise: p.total || 0,
    itcEligible: Boolean(p.supplierGstin && p.supplierGstin.length === 15),
  }));

  // 3. Outward Sales Register
  const salesQueryConditions = [
    eq(schema.sales.tenantId, tenantId),
    gte(schema.sales.createdAt, new Date(`${fromDate}T00:00:00.000Z`)),
    lte(schema.sales.createdAt, new Date(`${toDate}T23:59:59.999Z`)),
    eq(schema.sales.status, "completed"),
  ];
  if (storeId) salesQueryConditions.push(eq(schema.sales.storeId, storeId));

  const saleRecords = await db
    .select({
      invoiceNumber: schema.sales.invoiceNo,
      createdAt: schema.sales.createdAt,
      customerName: schema.customers.name,
      customerGstin: schema.customers.gstin,
      subtotal: schema.sales.taxableAmount,
      cgst: schema.sales.cgst,
      sgst: schema.sales.sgst,
      igst: schema.sales.igst,
      total: schema.sales.totalAmount,
    })
    .from(schema.sales)
    .leftJoin(schema.customers, eq(schema.sales.customerId, schema.customers.id))
    .where(and(...salesQueryConditions));

  const sales: CaSalesRegisterRow[] = saleRecords.map((s) => ({
    invoiceNumber: s.invoiceNumber || "INV-COUNTER",
    invoiceDate: s.createdAt.toISOString().slice(0, 10),
    customerName: s.customerName || "Walk-in Retail Consumer",
    customerGstin: s.customerGstin || "Unregistered (B2C)",
    saleType: s.customerGstin ? "B2B" : "B2C",
    taxableAmountPaise: s.subtotal || 0,
    cgstPaise: s.cgst || 0,
    sgstPaise: s.sgst || 0,
    igstPaise: s.igst || 0,
    totalPaise: s.total || 0,
  }));

  // 4. Financial Snapshot (Trial Balance & P&L)
  const trialBalanceReport = await generateTrialBalance(tenantId, storeId || "all", {
    from: fromDate,
    to: toDate,
  });

  const pnlReport = await generateProfitAndLoss(tenantId, storeId || "all", {
    from: fromDate,
    to: toDate,
  });

  // 5. Stock Valuation Ledger Snapshot
  const batchConditions = [
    eq(schema.batches.tenantId, tenantId),
    eq(schema.batches.status, "active"),
  ];
  if (storeId) batchConditions.push(eq(schema.batches.storeId, storeId));

  const batchStock = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalUnits: sql<number>`coalesce(sum(${schema.batches.qtyOnHand}), 0)::int`,
      totalCost: sql<number>`coalesce(sum(${schema.batches.qtyOnHand} * ${schema.batches.purchaseRate}), 0)::bigint`,
      totalMrp: sql<number>`coalesce(sum(${schema.batches.qtyOnHand} * ${schema.batches.mrp}), 0)::bigint`,
    })
    .from(schema.batches)
    .where(and(...batchConditions));

  const stockSummary = batchStock[0] || { count: 0, totalUnits: 0, totalCost: 0, totalMrp: 0 };

  return {
    month: monthString,
    tenant: { id: tenant.id, name: tenant.name, gstin: tenant.gstin },
    storeName: store?.name || "Main Counter",
    gstr1Summary: {
      totalB2bTaxablePaise: b2bTaxable,
      totalB2cTaxablePaise: b2cTaxable,
      totalTaxPaise: totalTax,
      b2bCount: gstr1.b2b.length,
      b2cCount: gstr1.b2cs.length,
      hsnCount: gstr1.hsnSummary.length,
    },
    gstr1JsonPayload,
    purchases,
    sales,
    trialBalance: {
      totalDebitPaise: trialBalanceReport.totals.closingDebit,
      totalCreditPaise: trialBalanceReport.totals.closingCredit,
    },
    profitAndLoss: {
      revenuePaise: pnlReport.revenue.totalRevenue,
      cogsPaise: pnlReport.cogs.totalCogs,
      grossProfitPaise: pnlReport.grossProfit,
      netProfitPaise: pnlReport.netProfit,
    },
    stockValuation: {
      totalBatches: stockSummary.count,
      totalUnitsOnHand: stockSummary.totalUnits,
      valuationAtCostPaise: Number(stockSummary.totalCost),
      valuationAtMrpPaise: Number(stockSummary.totalMrp),
    },
  };
}

export function formatSalesRegisterCsv(rows: CaSalesRegisterRow[]): string {
  const headers = ["Invoice No", "Date", "Customer Name", "Customer GSTIN", "Type", "Taxable (Rs)", "CGST (Rs)", "SGST (Rs)", "IGST (Rs)", "Total (Rs)"];
  const escape = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
  const toRupees = (paise: number) => (paise / 100).toFixed(2);

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) =>
      [
        r.invoiceNumber,
        r.invoiceDate,
        r.customerName,
        r.customerGstin,
        r.saleType,
        toRupees(r.taxableAmountPaise),
        toRupees(r.cgstPaise),
        toRupees(r.sgstPaise),
        toRupees(r.igstPaise),
        toRupees(r.totalPaise),
      ]
        .map(escape)
        .join(","),
    ),
  ];
  return "\uFEFF" + lines.join("\r\n");
}

export function formatPurchaseRegisterCsv(rows: CaPurchaseRegisterRow[]): string {
  const headers = ["Invoice No", "Date", "Supplier Name", "Supplier GSTIN", "Taxable (Rs)", "CGST (Rs)", "SGST (Rs)", "IGST (Rs)", "Total (Rs)", "ITC Eligible"];
  const escape = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
  const toRupees = (paise: number) => (paise / 100).toFixed(2);

  const lines = [
    headers.map(escape).join(","),
    ...rows.map((r) =>
      [
        r.invoiceNumber,
        r.invoiceDate,
        r.supplierName,
        r.supplierGstin,
        toRupees(r.taxableAmountPaise),
        toRupees(r.cgstPaise),
        toRupees(r.sgstPaise),
        toRupees(r.igstPaise),
        toRupees(r.totalPaise),
        r.itcEligible ? "YES" : "NO",
      ]
        .map(escape)
        .join(","),
    ),
  ];
  return "\uFEFF" + lines.join("\r\n");
}
