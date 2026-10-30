import { db, schema } from "@/server/db";
import { eq, and, sql, desc, gte, lte, inArray, gt, type Column, type SQL } from "drizzle-orm";
import { getOrSeedAccounts } from "./accounting";
import { format, differenceInDays, subMonths } from "date-fns";

export interface DateRangeFilter {
  from?: string | null;
  to?: string | null;
}

export type StoreScope = string | string[] | "all";

function isSql(col: Column | SQL): col is SQL {
  return "queryChunks" in col;
}

export function getStoreCondition(column: Column | SQL, scope?: StoreScope) {
  if (!scope || scope === "all") {
    return sql`TRUE`;
  }
  if (Array.isArray(scope)) {
    if (scope.length === 0) return sql`TRUE`;
    if (isSql(column)) {
      if (scope.length === 1) return eq(column, scope[0]!);
      return inArray(column, scope);
    }
    if (scope.length === 1) return eq(column, scope[0]!);
    return inArray(column, scope);
  }
  if (isSql(column)) {
    return eq(column, scope);
  }
  return eq(column, scope);
}

export function getStoreOrNullCondition(column: Column | SQL, scope?: StoreScope) {
  if (!scope || scope === "all") {
    return sql`TRUE`;
  }
  if (Array.isArray(scope)) {
    if (scope.length === 0) return sql`TRUE`;
    if (scope.length === 1) return sql`(${column} = ${scope[0]} OR ${column} IS NULL)`;
    const inCond = isSql(column) ? inArray(column, scope) : inArray(column, scope);
    return sql`(${inCond} OR ${column} IS NULL)`;
  }
  return sql`(${column} = ${scope} OR ${column} IS NULL)`;
}

/* ───────────────────────────── 1. Trial Balance ───────────────────────────── */

export interface TrialBalanceItem {
  id: string;
  code: string;
  name: string;
  type: string;
  systemKey: string | null;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  netBalance: number; // positive = debit, negative = credit
}

export interface TrialBalanceReport {
  items: TrialBalanceItem[];
  totals: {
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
  };
  isBalanced: boolean;
}

export async function generateTrialBalance(
  tenantId: string,
  storeScope: StoreScope = "all",
  dateRange: DateRangeFilter = {}
): Promise<TrialBalanceReport> {
  await getOrSeedAccounts(db, tenantId);

  const { from, to } = dateRange;

  // 1. Fetch all accounts
  const accs = await db
    .select()
    .from(schema.accounts)
    .where(and(eq(schema.accounts.tenantId, tenantId), eq(schema.accounts.isActive, true)))
    .orderBy(schema.accounts.code);

  // 2. Fetch all journal lines with entry metadata
  const linesQuery = db
    .select({
      accountId: schema.journalLines.accountId,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
      entryDate: schema.journalEntries.entryDate,
    })
    .from(schema.journalLines)
    .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
    .where(
      and(
        eq(schema.journalLines.tenantId, tenantId),
        getStoreOrNullCondition(schema.journalEntries.storeId, storeScope)
      )
    );

  const allLines = await linesQuery;

  const items: TrialBalanceItem[] = accs.map((acc) => {
    let openingDebit = 0;
    let openingCredit = 0;
    let periodDebit = 0;
    let periodCredit = 0;

    for (const line of allLines) {
      if (line.accountId !== acc.id) continue;

      const lineDate = line.entryDate;
      const isBeforePeriod = from ? lineDate < from : false;
      const isInPeriod =
        (!from || lineDate >= from) && (!to || lineDate <= to);

      if (isBeforePeriod) {
        openingDebit += line.debit;
        openingCredit += line.credit;
      } else if (isInPeriod) {
        periodDebit += line.debit;
        periodCredit += line.credit;
      }
    }

    const totalDebit = openingDebit + periodDebit;
    const totalCredit = openingCredit + periodCredit;
    const net = totalDebit - totalCredit;

    let closingDebit = 0;
    let closingCredit = 0;
    if (net > 0) {
      closingDebit = net;
    } else {
      closingCredit = Math.abs(net);
    }

    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      systemKey: acc.systemKey,
      openingDebit,
      openingCredit,
      periodDebit,
      periodCredit,
      closingDebit,
      closingCredit,
      netBalance: net,
    };
  }).filter((item) => item.periodDebit > 0 || item.periodCredit > 0 || item.openingDebit > 0 || item.openingCredit > 0);

  const totals = items.reduce(
    (acc, it) => {
      acc.openingDebit += it.openingDebit;
      acc.openingCredit += it.openingCredit;
      acc.periodDebit += it.periodDebit;
      acc.periodCredit += it.periodCredit;
      acc.closingDebit += it.closingDebit;
      acc.closingCredit += it.closingCredit;
      return acc;
    },
    {
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 0,
      closingDebit: 0,
      closingCredit: 0,
    }
  );

  return {
    items,
    totals,
    isBalanced: totals.closingDebit === totals.closingCredit,
  };
}

/* ───────────────────────────── 2. Profit & Loss ───────────────────────────── */

export interface ProfitAndLossReport {
  revenue: {
    accounts: Array<{ code: string; name: string; amount: number }>;
    totalRevenue: number;
  };
  cogs: {
    accounts: Array<{ code: string; name: string; amount: number }>;
    totalCogs: number;
  };
  grossProfit: number;
  operatingExpenses: {
    accounts: Array<{ code: string; name: string; amount: number }>;
    totalExpenses: number;
  };
  netProfit: number;
  marginPercent: number;
  periodLabel: string;
}

export async function generateProfitAndLoss(
  tenantId: string,
  storeScope: StoreScope = "all",
  dateRange: DateRangeFilter = {}
): Promise<ProfitAndLossReport> {
  const tb = await generateTrialBalance(tenantId, storeScope, dateRange);

  const revenueAccounts: Array<{ code: string; name: string; amount: number }> = [];
  const cogsAccounts: Array<{ code: string; name: string; amount: number }> = [];
  const opexAccounts: Array<{ code: string; name: string; amount: number }> = [];

  let totalRevenue = 0;
  let totalCogs = 0;
  let totalExpenses = 0;

  for (const item of tb.items) {
    if (item.type === "income") {
      // Income normally has credit balance: periodCredit - periodDebit
      const net = item.periodCredit - item.periodDebit;
      if (net !== 0) {
        revenueAccounts.push({ code: item.code, name: item.name, amount: net });
        totalRevenue += net;
      }
    } else if (item.type === "expense") {
      // Expense normally has debit balance: periodDebit - periodCredit
      const net = item.periodDebit - item.periodCredit;
      if (item.systemKey === "purchases" || item.code.startsWith("401")) {
        cogsAccounts.push({ code: item.code, name: item.name, amount: net });
        totalCogs += net;
      } else {
        opexAccounts.push({ code: item.code, name: item.name, amount: net });
        totalExpenses += net;
      }
    }
  }

  const grossProfit = totalRevenue - totalCogs;
  const netProfit = grossProfit - totalExpenses;
  const marginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const periodLabel = dateRange.from && dateRange.to
    ? `${dateRange.from} to ${dateRange.to}`
    : "All Time";

  return {
    revenue: { accounts: revenueAccounts, totalRevenue },
    cogs: { accounts: cogsAccounts, totalCogs },
    grossProfit,
    operatingExpenses: { accounts: opexAccounts, totalExpenses },
    netProfit,
    marginPercent: Math.round(marginPercent * 100) / 100,
    periodLabel,
  };
}

/* ───────────────────────────── 3. Balance Sheet ───────────────────────────── */

export interface BalanceSheetReport {
  assets: {
    currentAssets: Array<{ code: string; name: string; amount: number }>;
    fixedAssets: Array<{ code: string; name: string; amount: number }>;
    totalAssets: number;
  };
  liabilities: {
    currentLiabilities: Array<{ code: string; name: string; amount: number }>;
    totalLiabilities: number;
  };
  equity: {
    retainedEarnings: number;
    accounts: Array<{ code: string; name: string; amount: number }>;
    totalEquity: number;
  };
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
  asOfDate: string;
}

export async function generateBalanceSheet(
  tenantId: string,
  storeScope: StoreScope = "all",
  asOfDate: string = format(new Date(), "yyyy-MM-dd")
): Promise<BalanceSheetReport> {
  const tb = await generateTrialBalance(tenantId, storeScope, { to: asOfDate });
  const pnl = await generateProfitAndLoss(tenantId, storeScope, { to: asOfDate });

  const currentAssets: Array<{ code: string; name: string; amount: number }> = [];
  const fixedAssets: Array<{ code: string; name: string; amount: number }> = [];
  let totalAssets = 0;

  const currentLiabilities: Array<{ code: string; name: string; amount: number }> = [];
  let totalLiabilities = 0;

  const equityAccounts: Array<{ code: string; name: string; amount: number }> = [];
  let totalEquityAccounts = 0;

  for (const item of tb.items) {
    if (item.type === "asset") {
      const net = item.closingDebit - item.closingCredit;
      if (net !== 0) {
        if (item.code.startsWith("11")) {
          fixedAssets.push({ code: item.code, name: item.name, amount: net });
        } else {
          currentAssets.push({ code: item.code, name: item.name, amount: net });
        }
        totalAssets += net;
      }
    } else if (item.type === "liability") {
      const net = item.closingCredit - item.closingDebit;
      if (net !== 0) {
        currentLiabilities.push({ code: item.code, name: item.name, amount: net });
        totalLiabilities += net;
      }
    } else if (item.type === "equity") {
      const net = item.closingCredit - item.closingDebit;
      if (net !== 0) {
        equityAccounts.push({ code: item.code, name: item.name, amount: net });
        totalEquityAccounts += net;
      }
    }
  }

  const retainedEarnings = pnl.netProfit;
  const totalEquity = totalEquityAccounts + retainedEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return {
    assets: {
      currentAssets,
      fixedAssets,
      totalAssets,
    },
    liabilities: {
      currentLiabilities,
      totalLiabilities,
    },
    equity: {
      retainedEarnings,
      accounts: equityAccounts,
      totalEquity,
    },
    totalLiabilitiesAndEquity,
    isBalanced: totalAssets === totalLiabilitiesAndEquity,
    asOfDate,
  };
}

/* ───────────────────────────── 4. Cash Flow Statement ───────────────────────────── */

export interface CashFlowReport {
  operatingInflows: {
    cashSales: number;
    digitalSales: number;
    debtorReceipts: number;
    totalInflows: number;
  };
  operatingOutflows: {
    cashPurchases: number;
    creditorPayments: number;
    taxPaid: number;
    expenses: number;
    totalOutflows: number;
  };
  netOperatingCashFlow: number;
  openingCashAndBank: number;
  closingCashAndBank: number;
  periodLabel: string;
}

export async function generateCashFlow(
  tenantId: string,
  storeScope: StoreScope = "all",
  dateRange: DateRangeFilter = {}
): Promise<CashFlowReport> {
  const tb = await generateTrialBalance(tenantId, storeScope, dateRange);

  // Cash on Hand (1010) & Bank / Digital Payments (1020)
  const cashAccounts = tb.items.filter(
    (i) => i.code === "1010" || i.code === "1020" || i.systemKey === "cash" || i.systemKey === "bank"
  );

  const openingCashAndBank = cashAccounts.reduce(
    (sum, a) => sum + (a.openingDebit - a.openingCredit),
    0
  );
  const closingCashAndBank = cashAccounts.reduce(
    (sum, a) => sum + (a.closingDebit - a.closingCredit),
    0
  );

  // Parse lines to categorize cash inflows vs outflows
  const conditions = [
    eq(schema.journalLines.tenantId, tenantId),
    getStoreOrNullCondition(schema.journalEntries.storeId, storeScope),
  ];
  if (dateRange.from) {
    conditions.push(gte(schema.journalEntries.entryDate, dateRange.from));
  }
  if (dateRange.to) {
    conditions.push(lte(schema.journalEntries.entryDate, dateRange.to));
  }

  const cashAccountIds = cashAccounts.map((c) => c.id);

  const cashTransactions = await db
    .select({
      entryId: schema.journalEntries.id,
      entryDate: schema.journalEntries.entryDate,
      refType: schema.journalEntries.refType,
      narration: schema.journalEntries.narration,
      debit: schema.journalLines.debit,
      credit: schema.journalLines.credit,
      accountId: schema.journalLines.accountId,
    })
    .from(schema.journalLines)
    .innerJoin(schema.journalEntries, eq(schema.journalLines.entryId, schema.journalEntries.id))
    .where(and(...conditions, inArray(schema.journalLines.accountId, cashAccountIds)));

  let cashSales = 0;
  const digitalSales = 0;
  let debtorReceipts = 0;
  let cashPurchases = 0;
  const creditorPayments = 0;
  let expenses = 0;

  for (const tx of cashTransactions) {
    if (tx.debit > 0) {
      // Inflow
      if (tx.refType === "sale") {
        cashSales += tx.debit;
      } else {
        debtorReceipts += tx.debit;
      }
    } else if (tx.credit > 0) {
      // Outflow
      if (tx.refType === "purchase") {
        cashPurchases += tx.credit;
      } else {
        expenses += tx.credit;
      }
    }
  }

  const totalInflows = cashSales + digitalSales + debtorReceipts;
  const totalOutflows = cashPurchases + creditorPayments + expenses;
  const netOperatingCashFlow = totalInflows - totalOutflows;

  return {
    operatingInflows: {
      cashSales,
      digitalSales,
      debtorReceipts,
      totalInflows,
    },
    operatingOutflows: {
      cashPurchases,
      creditorPayments,
      taxPaid: 0,
      expenses,
      totalOutflows,
    },
    netOperatingCashFlow,
    openingCashAndBank,
    closingCashAndBank,
    periodLabel: dateRange.from && dateRange.to ? `${dateRange.from} to ${dateRange.to}` : "All Time",
  };
}

/* ───────────────────────────── 5. Outstanding Receivables & Payables ───────────────────────────── */

export interface OutstandingPartyRow {
  id: string;
  name: string;
  phone: string | null;
  totalDue: number; // in paise
  bucket0to30: number;
  bucket31to60: number;
  bucket61to90: number;
  bucketOver90: number;
  invoiceCount: number;
  latestInvoiceDate: string | null;
}

export interface OutstandingReport {
  type: "receivable" | "payable";
  parties: OutstandingPartyRow[];
  totalDue: number;
  buckets: {
    bucket0to30: number;
    bucket31to60: number;
    bucket61to90: number;
    bucketOver90: number;
  };
}

export async function generateOutstanding(
  tenantId: string,
  storeScope: StoreScope = "all",
  type: "receivable" | "payable"
): Promise<OutstandingReport> {
  const today = new Date();

  if (type === "receivable") {
    // Customers with unpaid credit invoices
    const salesWithCredit = await db
      .select({
        sale: schema.sales,
        customer: schema.customers,
      })
      .from(schema.sales)
      .leftJoin(schema.customers, eq(schema.sales.customerId, schema.customers.id))
      .where(
        and(
          eq(schema.sales.tenantId, tenantId),
          getStoreCondition(schema.sales.storeId, storeScope),
          gt(schema.sales.creditAmount, 0),
          eq(schema.sales.status, "completed")
        )
      );

    const partyMap = new Map<string, OutstandingPartyRow>();

    for (const { sale, customer } of salesWithCredit) {
      const partyId = customer?.id || `walkin-${sale.customerName || "unknown"}`;
      const partyName = customer?.name || sale.customerName || "Walk-in Customer";
      const partyPhone = customer?.phone || sale.customerPhone || null;
      const due = sale.creditAmount || 0;
      const invDate = sale.completedAt ? new Date(sale.completedAt) : new Date(sale.createdAt);
      const ageDays = differenceInDays(today, invDate);

      let existing = partyMap.get(partyId);
      if (!existing) {
        existing = {
          id: partyId,
          name: partyName,
          phone: partyPhone,
          totalDue: 0,
          bucket0to30: 0,
          bucket31to60: 0,
          bucket61to90: 0,
          bucketOver90: 0,
          invoiceCount: 0,
          latestInvoiceDate: format(invDate, "yyyy-MM-dd"),
        };
        partyMap.set(partyId, existing);
      }

      existing.totalDue += due;
      existing.invoiceCount += 1;

      if (ageDays <= 30) {
        existing.bucket0to30 += due;
      } else if (ageDays <= 60) {
        existing.bucket31to60 += due;
      } else if (ageDays <= 90) {
        existing.bucket61to90 += due;
      } else {
        existing.bucketOver90 += due;
      }
    }

    const parties = Array.from(partyMap.values()).sort((a, b) => b.totalDue - a.totalDue);
    const buckets = parties.reduce(
      (b, p) => {
        b.bucket0to30 += p.bucket0to30;
        b.bucket31to60 += p.bucket31to60;
        b.bucket61to90 += p.bucket61to90;
        b.bucketOver90 += p.bucketOver90;
        return b;
      },
      { bucket0to30: 0, bucket31to60: 0, bucket61to90: 0, bucketOver90: 0 }
    );

    return {
      type: "receivable",
      parties,
      totalDue: parties.reduce((sum, p) => sum + p.totalDue, 0),
      buckets,
    };
  } else {
    // Payables to Suppliers
    const unpaidPurchases = await db
      .select({
        purchase: schema.purchases,
        supplier: schema.suppliers,
      })
      .from(schema.purchases)
      .innerJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
      .where(
        and(
          eq(schema.purchases.tenantId, tenantId),
          getStoreCondition(schema.purchases.storeId, storeScope),
          sql`${schema.purchases.totalAmount} > ${schema.purchases.paidAmount}`
        )
      );

    const partyMap = new Map<string, OutstandingPartyRow>();

    for (const { purchase, supplier } of unpaidPurchases) {
      const due = (purchase.totalAmount || 0) - (purchase.paidAmount || 0);
      const invDate = new Date(purchase.invoiceDate);
      const ageDays = differenceInDays(today, invDate);

      let existing = partyMap.get(supplier.id);
      if (!existing) {
        existing = {
          id: supplier.id,
          name: supplier.name,
          phone: supplier.phone || null,
          totalDue: 0,
          bucket0to30: 0,
          bucket31to60: 0,
          bucket61to90: 0,
          bucketOver90: 0,
          invoiceCount: 0,
          latestInvoiceDate: purchase.invoiceDate,
        };
        partyMap.set(supplier.id, existing);
      }

      existing.totalDue += due;
      existing.invoiceCount += 1;

      if (ageDays <= 30) {
        existing.bucket0to30 += due;
      } else if (ageDays <= 60) {
        existing.bucket31to60 += due;
      } else if (ageDays <= 90) {
        existing.bucket61to90 += due;
      } else {
        existing.bucketOver90 += due;
      }
    }

    const parties = Array.from(partyMap.values()).sort((a, b) => b.totalDue - a.totalDue);
    const buckets = parties.reduce(
      (b, p) => {
        b.bucket0to30 += p.bucket0to30;
        b.bucket31to60 += p.bucket31to60;
        b.bucket61to90 += p.bucket61to90;
        b.bucketOver90 += p.bucketOver90;
        return b;
      },
      { bucket0to30: 0, bucket31to60: 0, bucket61to90: 0, bucketOver90: 0 }
    );

    return {
      type: "payable",
      parties,
      totalDue: parties.reduce((sum, p) => sum + p.totalDue, 0),
      buckets,
    };
  }
}

/* ───────────────────────────── 6. Inventory & Movement Analytics ───────────────────────────── */

export interface FastSlowItem {
  medicineId: string;
  name: string;
  genericName: string | null;
  totalQtySold: number;
  totalRevenuePaise: number;
  currentStock: number;
}

export interface InventoryMovementReport {
  fastMoving: FastSlowItem[];
  slowMoving: FastSlowItem[];
  nonMoving: Array<{
    medicineId: string;
    name: string;
    genericName: string | null;
    currentStock: number;
    stockValuationPaise: number;
  }>;
  totalStockValuationPaise: number;
}

export async function generateInventoryAnalytics(
  tenantId: string,
  storeScope: StoreScope = "all",
  dateRange: DateRangeFilter = {}
): Promise<InventoryMovementReport> {
  const conditions = [
    eq(schema.saleItems.tenantId, tenantId),
    getStoreCondition(schema.sales.storeId, storeScope),
    eq(schema.sales.status, "completed"),
  ];

  if (dateRange.from) {
    conditions.push(gte(schema.sales.createdAt, new Date(dateRange.from + "T00:00:00")));
  }
  if (dateRange.to) {
    conditions.push(lte(schema.sales.createdAt, new Date(dateRange.to + "T23:59:59.999")));
  }

  // 1. Group sales by medicine
  const salesSummary = await db
    .select({
      medicineId: schema.saleItems.medicineId,
      medicineName: schema.saleItems.medicineName,
      totalQtySold: sql<number>`COALESCE(SUM(${schema.saleItems.qty}), 0)`,
      totalRevenue: sql<number>`COALESCE(SUM(${schema.saleItems.totalAmount}), 0)`,
    })
    .from(schema.saleItems)
    .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
    .where(and(...conditions))
    .groupBy(schema.saleItems.medicineId, schema.saleItems.medicineName)
    .orderBy(desc(sql`SUM(${schema.saleItems.qty})`));

  // 2. Fetch current stock by medicine
  const stockByMedicine = await db
    .select({
      medicineId: schema.batches.medicineId,
      totalStock: sql<number>`COALESCE(SUM(${schema.batches.qtyOnHand}), 0)`,
      stockValuation: sql<number>`COALESCE(SUM(${schema.batches.qtyOnHand} * ${schema.batches.purchaseRate}), 0)`,
    })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.tenantId, tenantId),
        getStoreCondition(schema.batches.storeId, storeScope),
        gt(schema.batches.qtyOnHand, 0)
      )
    )
    .groupBy(schema.batches.medicineId);

  const stockMap = new Map<string, { totalStock: number; valuation: number }>();
  let totalStockValuationPaise = 0;
  for (const s of stockByMedicine) {
    stockMap.set(s.medicineId, {
      totalStock: Number(s.totalStock),
      valuation: Number(s.stockValuation),
    });
    totalStockValuationPaise += Number(s.stockValuation);
  }

  // 3. Fetch medicines metadata
  const allMeds = await db
    .select({
      id: schema.medicines.id,
      name: schema.medicines.name,
      genericName: schema.medicines.genericName,
    })
    .from(schema.medicines)
    .where(and(eq(schema.medicines.tenantId, tenantId), eq(schema.medicines.isActive, true)));

  const medMap = new Map(allMeds.map((m) => [m.id, m]));

  const fastMoving: FastSlowItem[] = salesSummary.slice(0, 15).map((s) => {
    const med = medMap.get(s.medicineId);
    return {
      medicineId: s.medicineId,
      name: med?.name || s.medicineName,
      genericName: med?.genericName || null,
      totalQtySold: Number(s.totalQtySold),
      totalRevenuePaise: Number(s.totalRevenue),
      currentStock: stockMap.get(s.medicineId)?.totalStock || 0,
    };
  });

  const slowMoving: FastSlowItem[] = salesSummary
    .slice(-15)
    .reverse()
    .map((s) => {
      const med = medMap.get(s.medicineId);
      return {
        medicineId: s.medicineId,
        name: med?.name || s.medicineName,
        genericName: med?.genericName || null,
        totalQtySold: Number(s.totalQtySold),
        totalRevenuePaise: Number(s.totalRevenue),
        currentStock: stockMap.get(s.medicineId)?.totalStock || 0,
      };
    });

  // Non-moving: medicines with stock on hand but 0 sales in period
  const soldMedIds = new Set(salesSummary.map((s) => s.medicineId));
  const nonMoving = allMeds
    .filter((m) => !soldMedIds.has(m.id) && (stockMap.get(m.id)?.totalStock || 0) > 0)
    .slice(0, 30)
    .map((m) => ({
      medicineId: m.id,
      name: m.name,
      genericName: m.genericName,
      currentStock: stockMap.get(m.id)?.totalStock || 0,
      stockValuationPaise: stockMap.get(m.id)?.valuation || 0,
    }));

  return {
    fastMoving,
    slowMoving,
    nonMoving,
    totalStockValuationPaise,
  };
}

/* ───────────────────────────── 7. Expiry Exposure Report ───────────────────────────── */

export interface ExpiryBatchRow {
  batchId: string;
  batchNo: string;
  medicineName: string;
  expiryDate: string;
  qtyOnHand: number;
  mrp: number;
  purchaseRate: number;
  lossExposurePaise: number;
  daysRemaining: number;
}

export interface ExpiryExposureReport {
  expired: ExpiryBatchRow[];
  expiringIn30Days: ExpiryBatchRow[];
  expiringIn60Days: ExpiryBatchRow[];
  expiringIn90Days: ExpiryBatchRow[];
  totalExpiredLossPaise: number;
  totalAtRiskLossPaise: number;
}

export async function generateExpiryReport(
  tenantId: string,
  storeScope: StoreScope = "all"
): Promise<ExpiryExposureReport> {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  const batches = await db
    .select({
      batch: schema.batches,
      medicine: schema.medicines,
    })
    .from(schema.batches)
    .innerJoin(schema.medicines, eq(schema.batches.medicineId, schema.medicines.id))
    .where(
      and(
        eq(schema.batches.tenantId, tenantId),
        getStoreCondition(schema.batches.storeId, storeScope),
        gt(schema.batches.qtyOnHand, 0)
      )
    )
    .orderBy(schema.batches.expiryDate);

  const expired: ExpiryBatchRow[] = [];
  const expiringIn30Days: ExpiryBatchRow[] = [];
  const expiringIn60Days: ExpiryBatchRow[] = [];
  const expiringIn90Days: ExpiryBatchRow[] = [];

  let totalExpiredLossPaise = 0;
  let totalAtRiskLossPaise = 0;

  for (const { batch, medicine } of batches) {
    const expDate = new Date(batch.expiryDate);
    const days = differenceInDays(expDate, today);
    const loss = batch.qtyOnHand * (batch.purchaseRate || 0);

    const row: ExpiryBatchRow = {
      batchId: batch.id,
      batchNo: batch.batchNo,
      medicineName: medicine.name,
      expiryDate: batch.expiryDate,
      qtyOnHand: batch.qtyOnHand,
      mrp: batch.mrp,
      purchaseRate: batch.purchaseRate,
      lossExposurePaise: loss,
      daysRemaining: days,
    };

    if (days <= 0) {
      expired.push(row);
      totalExpiredLossPaise += loss;
    } else if (days <= 30) {
      expiringIn30Days.push(row);
      totalAtRiskLossPaise += loss;
    } else if (days <= 60) {
      expiringIn60Days.push(row);
      totalAtRiskLossPaise += loss;
    } else if (days <= 90) {
      expiringIn90Days.push(row);
      totalAtRiskLossPaise += loss;
    }
  }

  return {
    expired,
    expiringIn30Days,
    expiringIn60Days,
    expiringIn90Days,
    totalExpiredLossPaise,
    totalAtRiskLossPaise,
  };
}

/* ───────────────────────────── 8. Chain-Wide Overview Report (B3.1) ───────────────────────────── */

export interface ChainStoreSummary {
  storeId: string;
  storeName: string;
  storeCode: string;
  storeCity: string | null;
  totalRevenuePaise: number;
  totalCogsPaise: number;
  grossMarginPaise: number;
  grossMarginPercent: number;
  salesCount: number;
  stockValuationPaise: number;
  nearExpiryValuationPaise: number;
  outOfStockSkus: number;
}

export interface ChainOverviewReport {
  periodLabel: string;
  totalChainRevenuePaise: number;
  totalChainCogsPaise: number;
  chainGrossMarginPaise: number;
  chainGrossMarginPercent: number;
  totalSalesCount: number;
  totalStockValuationPaise: number;
  totalNearExpiryValuationPaise: number;
  totalOutOfStockSkus: number;
  stores: ChainStoreSummary[];
  monthlyTrend: Array<{
    month: string;
    revenuePaise: number;
    marginPaise: number;
  }>;
}

export async function generateChainOverviewReport(
  tenantId: string,
  storeScope: StoreScope = "all",
  dateRange: DateRangeFilter = {}
): Promise<ChainOverviewReport> {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const ninetyDaysFromNowStr = format(new Date(Date.now() + 90 * 86400000), "yyyy-MM-dd");

  // 1. Fetch target stores
  const storeConds = [eq(schema.stores.tenantId, tenantId), eq(schema.stores.isActive, true)];
  if (storeScope !== "all") {
    if (Array.isArray(storeScope)) {
      if (storeScope.length > 0) storeConds.push(inArray(schema.stores.id, storeScope));
    } else {
      storeConds.push(eq(schema.stores.id, storeScope));
    }
  }

  const storesList = await db
    .select({
      id: schema.stores.id,
      name: schema.stores.name,
      code: schema.stores.code,
      city: schema.stores.city,
    })
    .from(schema.stores)
    .where(and(...storeConds))
    .orderBy(schema.stores.name);

  const targetStoreIds = storesList.map((s) => s.id);
  if (targetStoreIds.length === 0) {
    return {
      periodLabel: "No stores",
      totalChainRevenuePaise: 0,
      totalChainCogsPaise: 0,
      chainGrossMarginPaise: 0,
      chainGrossMarginPercent: 0,
      totalSalesCount: 0,
      totalStockValuationPaise: 0,
      totalNearExpiryValuationPaise: 0,
      totalOutOfStockSkus: 0,
      stores: [],
      monthlyTrend: [],
    };
  }

  // 2. Query completed sales in the period
  const salesConds = [
    eq(schema.sales.tenantId, tenantId),
    eq(schema.sales.status, "completed"),
    inArray(schema.sales.storeId, targetStoreIds),
  ];
  if (dateRange.from) {
    salesConds.push(gte(schema.sales.createdAt, new Date(dateRange.from + "T00:00:00")));
  }
  if (dateRange.to) {
    salesConds.push(lte(schema.sales.createdAt, new Date(dateRange.to + "T23:59:59.999")));
  }

  const sales = await db
    .select({
      id: schema.sales.id,
      storeId: schema.sales.storeId,
      totalAmount: schema.sales.totalAmount,
      createdAt: schema.sales.createdAt,
    })
    .from(schema.sales)
    .where(and(...salesConds));

  // 3. Query sale items with purchase cost to derive COGS
  const saleItems = await db
    .select({
      storeId: schema.sales.storeId,
      qty: schema.saleItems.qty,
      purchaseRate: schema.batches.purchaseRate,
    })
    .from(schema.saleItems)
    .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
    .leftJoin(schema.batches, eq(schema.saleItems.batchId, schema.batches.id))
    .where(and(...salesConds));

  // Map store sales and cogs
  const revenueMap = new Map<string, number>();
  const salesCountMap = new Map<string, number>();
  for (const s of sales) {
    revenueMap.set(s.storeId, (revenueMap.get(s.storeId) || 0) + (s.totalAmount || 0));
    salesCountMap.set(s.storeId, (salesCountMap.get(s.storeId) || 0) + 1);
  }

  const cogsMap = new Map<string, number>();
  for (const item of saleItems) {
    const cost = (item.qty || 0) * (item.purchaseRate || 0);
    cogsMap.set(item.storeId, (cogsMap.get(item.storeId) || 0) + cost);
  }

  // 4. Query batches for stock and expiry valuation
  const batches = await db
    .select({
      storeId: schema.batches.storeId,
      medicineId: schema.batches.medicineId,
      qtyOnHand: schema.batches.qtyOnHand,
      purchaseRate: schema.batches.purchaseRate,
      expiryDate: schema.batches.expiryDate,
      status: schema.batches.status,
    })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.tenantId, tenantId),
        inArray(schema.batches.storeId, targetStoreIds),
        gt(schema.batches.qtyOnHand, 0)
      )
    );

  const stockValMap = new Map<string, number>();
  const nearExpiryValMap = new Map<string, number>();
  const stockedMedsPerStore = new Map<string, Set<string>>();

  for (const b of batches) {
    const val = (b.qtyOnHand || 0) * (b.purchaseRate || 0);
    stockValMap.set(b.storeId, (stockValMap.get(b.storeId) || 0) + val);

    if (b.expiryDate >= todayStr && b.expiryDate <= ninetyDaysFromNowStr) {
      nearExpiryValMap.set(b.storeId, (nearExpiryValMap.get(b.storeId) || 0) + val);
    }

    if (b.status === "active") {
      let set = stockedMedsPerStore.get(b.storeId);
      if (!set) {
        set = new Set<string>();
        stockedMedsPerStore.set(b.storeId, set);
      }
      set.add(b.medicineId);
    }
  }

  // 5. Total active medicines in catalog
  const activeMeds = await db
    .select({ id: schema.medicines.id })
    .from(schema.medicines)
    .where(and(eq(schema.medicines.tenantId, tenantId), eq(schema.medicines.isActive, true)));
  const totalCatalogMeds = activeMeds.length;

  // 6. Build per-store summary
  let totalChainRevenue = 0;
  let totalChainCogs = 0;
  let totalSalesCount = 0;
  let totalStockValuation = 0;
  let totalNearExpiryValuation = 0;

  const stores: ChainStoreSummary[] = storesList.map((st) => {
    const rev = revenueMap.get(st.id) || 0;
    const cogs = cogsMap.get(st.id) || 0;
    const margin = rev - cogs;
    const marginPct = rev > 0 ? (margin / rev) * 100 : 0;
    const count = salesCountMap.get(st.id) || 0;
    const stockVal = stockValMap.get(st.id) || 0;
    const nearExpVal = nearExpiryValMap.get(st.id) || 0;
    const stockedCount = stockedMedsPerStore.get(st.id)?.size || 0;
    const oos = Math.max(0, totalCatalogMeds - stockedCount);

    totalChainRevenue += rev;
    totalChainCogs += cogs;
    totalSalesCount += count;
    totalStockValuation += stockVal;
    totalNearExpiryValuation += nearExpVal;

    return {
      storeId: st.id,
      storeName: st.name,
      storeCode: st.code,
      storeCity: st.city,
      totalRevenuePaise: rev,
      totalCogsPaise: cogs,
      grossMarginPaise: margin,
      grossMarginPercent: Math.round(marginPct * 100) / 100,
      salesCount: count,
      stockValuationPaise: stockVal,
      nearExpiryValuationPaise: nearExpVal,
      outOfStockSkus: oos,
    };
  });

  // Sort stores descending by revenue
  stores.sort((a, b) => b.totalRevenuePaise - a.totalRevenuePaise);

  const chainMargin = totalChainRevenue - totalChainCogs;
  const chainMarginPct = totalChainRevenue > 0 ? (chainMargin / totalChainRevenue) * 100 : 0;

  // 7. Monthly trend (last 6 months)
  const monthlyTrendMap = new Map<string, { revenue: number; cogs: number }>();
  for (let i = 5; i >= 0; i--) {
    const mStr = format(subMonths(today, i), "yyyy-MM");
    monthlyTrendMap.set(mStr, { revenue: 0, cogs: 0 });
  }

  for (const s of sales) {
    const mStr = format(new Date(s.createdAt), "yyyy-MM");
    const entry = monthlyTrendMap.get(mStr);
    if (entry) {
      entry.revenue += s.totalAmount || 0;
    }
  }

  const monthlyTrend = Array.from(monthlyTrendMap.entries()).map(([month, data]) => ({
    month,
    revenuePaise: data.revenue,
    marginPaise: data.revenue - data.cogs,
  }));

  const periodLabel = dateRange.from && dateRange.to
    ? `${dateRange.from} to ${dateRange.to}`
    : "All Time";

  return {
    periodLabel,
    totalChainRevenuePaise: totalChainRevenue,
    totalChainCogsPaise: totalChainCogs,
    chainGrossMarginPaise: chainMargin,
    chainGrossMarginPercent: Math.round(chainMarginPct * 100) / 100,
    totalSalesCount,
    totalStockValuationPaise: totalStockValuation,
    totalNearExpiryValuationPaise: totalNearExpiryValuation,
    totalOutOfStockSkus: Math.max(...stores.map((s) => s.outOfStockSkus), 0),
    stores,
    monthlyTrend,
  };
}
