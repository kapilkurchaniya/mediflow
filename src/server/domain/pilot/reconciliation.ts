import { db } from "@/server/db";
import { sales, salePayments } from "@/server/db/schema";
import { eq, and, sql } from "drizzle-orm";

export interface LegacyDailyReportInput {
  date: string; // YYYY-MM-DD
  storeId: string;
  legacySystem: "MARG" | "VYAPAR" | "BUSY" | "MANUAL";
  grossSalesPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalTaxPaise: number;
  netSalesPaise: number;
  cashCollectedPaise: number;
  digitalCollectedPaise: number;
  creditSalesPaise: number;
  totalBillsCount: number;
  cancelledBillsCount: number;
}

export interface DayTotalsSummary {
  grossSalesPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalTaxPaise: number;
  netSalesPaise: number;
  cashCollectedPaise: number;
  digitalCollectedPaise: number;
  creditSalesPaise: number;
  totalBillsCount: number;
  cancelledBillsCount: number;
}

export interface DiscrepancyItem {
  metric: string;
  mediFlowValue: number;
  legacyValue: number;
  delta: number;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface DailyReconciliationResult {
  date: string;
  storeId: string;
  legacySystem: string;
  status: "MATCH" | "TOLERABLE_ROUNDING" | "CRITICAL_MISMATCH";
  mediFlowTotals: DayTotalsSummary;
  legacyTotals: DayTotalsSummary;
  deltas: DayTotalsSummary;
  discrepancies: DiscrepancyItem[];
  summaryNote: string;
}

export function compareDailyTotals(
  mediFlow: DayTotalsSummary,
  legacy: DayTotalsSummary,
  context: { date: string; storeId: string; legacySystem: string },
): DailyReconciliationResult {
  const deltas: DayTotalsSummary = {
    grossSalesPaise: mediFlow.grossSalesPaise - legacy.grossSalesPaise,
    taxableAmountPaise: mediFlow.taxableAmountPaise - legacy.taxableAmountPaise,
    cgstPaise: mediFlow.cgstPaise - legacy.cgstPaise,
    sgstPaise: mediFlow.sgstPaise - legacy.sgstPaise,
    totalTaxPaise: mediFlow.totalTaxPaise - legacy.totalTaxPaise,
    netSalesPaise: mediFlow.netSalesPaise - legacy.netSalesPaise,
    cashCollectedPaise: mediFlow.cashCollectedPaise - legacy.cashCollectedPaise,
    digitalCollectedPaise: mediFlow.digitalCollectedPaise - legacy.digitalCollectedPaise,
    creditSalesPaise: mediFlow.creditSalesPaise - legacy.creditSalesPaise,
    totalBillsCount: mediFlow.totalBillsCount - legacy.totalBillsCount,
    cancelledBillsCount: mediFlow.cancelledBillsCount - legacy.cancelledBillsCount,
  };

  const discrepancies: DiscrepancyItem[] = [];

  const check = (
    metric: string,
    mfVal: number,
    legVal: number,
    delta: number,
    tolerablePaise: number,
    isCurrency = true,
  ) => {
    if (delta === 0) return;
    const absDelta = Math.abs(delta);
    const inUnit = isCurrency ? (absDelta / 100).toFixed(2) : String(absDelta);
    if (absDelta <= tolerablePaise) {
      discrepancies.push({
        metric,
        mediFlowValue: mfVal,
        legacyValue: legVal,
        delta,
        severity: "warning",
        message: `Minor rounding variance of ${isCurrency ? "₹" : ""}${inUnit} within acceptable tolerance.`,
      });
    } else {
      discrepancies.push({
        metric,
        mediFlowValue: mfVal,
        legacyValue: legVal,
        delta,
        severity: "critical",
        message: `Material mismatch of ${isCurrency ? "₹" : ""}${inUnit}. Verify missing invoices or return entries.`,
      });
    }
  };

  check("Net Sales", mediFlow.netSalesPaise, legacy.netSalesPaise, deltas.netSalesPaise, 200);
  check("Taxable Value", mediFlow.taxableAmountPaise, legacy.taxableAmountPaise, deltas.taxableAmountPaise, 200);
  check("CGST", mediFlow.cgstPaise, legacy.cgstPaise, deltas.cgstPaise, 100);
  check("SGST", mediFlow.sgstPaise, legacy.sgstPaise, deltas.sgstPaise, 100);
  check("Cash Collected", mediFlow.cashCollectedPaise, legacy.cashCollectedPaise, deltas.cashCollectedPaise, 200);
  check("Digital (UPI/Card)", mediFlow.digitalCollectedPaise, legacy.digitalCollectedPaise, deltas.digitalCollectedPaise, 200);
  check("Total Invoices Count", mediFlow.totalBillsCount, legacy.totalBillsCount, deltas.totalBillsCount, 0, false);
  check("Cancelled Bills Count", mediFlow.cancelledBillsCount, legacy.cancelledBillsCount, deltas.cancelledBillsCount, 0, false);

  let status: "MATCH" | "TOLERABLE_ROUNDING" | "CRITICAL_MISMATCH" = "MATCH";
  if (discrepancies.some((d) => d.severity === "critical")) {
    status = "CRITICAL_MISMATCH";
  } else if (discrepancies.some((d) => d.severity === "warning")) {
    status = "TOLERABLE_ROUNDING";
  }

  let summaryNote = "MediFlow and legacy totals match 100% to the rupee.";
  if (status === "TOLERABLE_ROUNDING") {
    summaryNote = "Totals match within acceptable fractional rounding tolerances (< ₹2.00).";
  } else if (status === "CRITICAL_MISMATCH") {
    summaryNote = `Found ${discrepancies.filter((d) => d.severity === "critical").length} critical variances. Reconcile bill sequence.`;
  }

  return {
    date: context.date,
    storeId: context.storeId,
    legacySystem: context.legacySystem,
    status,
    mediFlowTotals: mediFlow,
    legacyTotals: legacy,
    deltas,
    discrepancies,
    summaryNote,
  };
}

export async function getMediFlowDailyTotals(
  tenantId: string,
  storeId: string,
  dateStr: string,
  dbInstance = db,
): Promise<DayTotalsSummary> {
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

  const salesRows = await dbInstance
    .select({
      status: sales.status,
      taxableAmount: sales.taxableAmount,
      cgst: sales.cgst,
      sgst: sales.sgst,
      totalAmount: sales.totalAmount,
    })
    .from(sales)
    .where(
      and(
        eq(sales.tenantId, tenantId),
        eq(sales.storeId, storeId),
        sql`${sales.createdAt} >= ${startOfDay} AND ${sales.createdAt} <= ${endOfDay}`,
      ),
    );

  let grossSalesPaise = 0;
  let taxableAmountPaise = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let netSalesPaise = 0;
  let totalBillsCount = 0;
  let cancelledBillsCount = 0;

  for (const s of salesRows) {
    if (s.status === "CANCELLED") {
      cancelledBillsCount += 1;
      continue;
    }
    totalBillsCount += 1;
    taxableAmountPaise += Number(s.taxableAmount ?? 0);
    cgstPaise += Number(s.cgst ?? 0);
    sgstPaise += Number(s.sgst ?? 0);
    netSalesPaise += Number(s.totalAmount ?? 0);
    grossSalesPaise += Number(s.totalAmount ?? 0);
  }

  const paymentRows = await dbInstance
    .select({
      method: salePayments.method,
      amount: salePayments.amount,
    })
    .from(salePayments)
    .where(
      and(
        eq(salePayments.tenantId, tenantId),
        sql`${salePayments.createdAt} >= ${startOfDay} AND ${salePayments.createdAt} <= ${endOfDay}`,
      ),
    );

  let cashCollectedPaise = 0;
  let digitalCollectedPaise = 0;
  let creditSalesPaise = 0;

  for (const p of paymentRows) {
    const amt = Number(p.amount ?? 0);
    if (p.method === "CASH") cashCollectedPaise += amt;
    else if (p.method === "UPI" || p.method === "CARD" || p.method === "NET_BANKING") digitalCollectedPaise += amt;
    else if (p.method === "CREDIT") creditSalesPaise += amt;
  }

  return {
    grossSalesPaise,
    taxableAmountPaise,
    cgstPaise,
    sgstPaise,
    totalTaxPaise: cgstPaise + sgstPaise,
    netSalesPaise,
    cashCollectedPaise,
    digitalCollectedPaise,
    creditSalesPaise,
    totalBillsCount,
    cancelledBillsCount,
  };
}

export async function reconcileDailyReport(
  tenantId: string,
  input: LegacyDailyReportInput,
  dbInstance = db,
): Promise<DailyReconciliationResult> {
  const mfTotals = await getMediFlowDailyTotals(tenantId, input.storeId, input.date, dbInstance);
  return compareDailyTotals(mfTotals, input, {
    date: input.date,
    storeId: input.storeId,
    legacySystem: input.legacySystem,
  });
}

export function formatReconciliationSummaryCsv(res: DailyReconciliationResult): string {
  const inRs = (paise: number) => (paise / 100).toFixed(2);
  const rows = [
    ["Metric", "MediFlow Value", "Legacy Value", "Delta", "Status"],
    ["Net Sales (Rs)", inRs(res.mediFlowTotals.netSalesPaise), inRs(res.legacyTotals.netSalesPaise), inRs(res.deltas.netSalesPaise), res.status],
    ["Taxable Amount (Rs)", inRs(res.mediFlowTotals.taxableAmountPaise), inRs(res.legacyTotals.taxableAmountPaise), inRs(res.deltas.taxableAmountPaise), ""],
    ["CGST (Rs)", inRs(res.mediFlowTotals.cgstPaise), inRs(res.legacyTotals.cgstPaise), inRs(res.deltas.cgstPaise), ""],
    ["SGST (Rs)", inRs(res.mediFlowTotals.sgstPaise), inRs(res.legacyTotals.sgstPaise), inRs(res.deltas.sgstPaise), ""],
    ["Cash Tender (Rs)", inRs(res.mediFlowTotals.cashCollectedPaise), inRs(res.legacyTotals.cashCollectedPaise), inRs(res.deltas.cashCollectedPaise), ""],
    ["Digital/UPI Tender (Rs)", inRs(res.mediFlowTotals.digitalCollectedPaise), inRs(res.legacyTotals.digitalCollectedPaise), inRs(res.deltas.digitalCollectedPaise), ""],
    ["Total Bills Count", String(res.mediFlowTotals.totalBillsCount), String(res.legacyTotals.totalBillsCount), String(res.deltas.totalBillsCount), ""],
    ["Cancelled Bills Count", String(res.mediFlowTotals.cancelledBillsCount), String(res.legacyTotals.cancelledBillsCount), String(res.deltas.cancelledBillsCount), ""],
  ];

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = rows.map((r) => r.map(esc).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

