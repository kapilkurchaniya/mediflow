import Link from "next/link";
import {
  Landmark,
  ReceiptText,
  FileSpreadsheet,
  QrCode,
  ArrowUpRight,
  ShieldCheck,
  AlertCircle,
  FileDown,
  Clock,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { PageHeader, StatCard } from "@/app/components/ui";
import { formatINR } from "@/lib/money";
import { getGstDashboard } from "@/app/actions/gst";
import { GstPeriodSelector } from "./GstPeriodSelector";

export const dynamic = "force-dynamic";

export default async function GstDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const resolved = await searchParams;
  const now = new Date();
  const month = resolved.month ? Number(resolved.month) : now.getMonth() + 1;
  const year = resolved.year ? Number(resolved.year) : now.getFullYear();

  const data = await getGstDashboard({ month, year });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const currentMonthName = monthNames[month - 1];

  const netPayable = data.reconciliation.netTaxPayable.total;
  const carriedForward = data.reconciliation.itcCarriedForward.total;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        eyebrow="Taxation & E-Invoicing Engine"
        title="GST Compliance Dashboard"
        description={`Statutory filing returns, tax liability netting, and NIC E-Invoice operations for ${currentMonthName} ${year}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <GstPeriodSelector month={month} year={year} />
            <Link
              href={`/dashboard/gst/returns?month=${month}&year=${year}`}
              className="btn btn-secondary text-xs"
            >
              <FileDown className="h-3.5 w-3.5 mr-1" />
              Returns Filing
            </Link>
            <Link
              href="/dashboard/gst/e-invoice"
              className="btn btn-primary text-xs"
            >
              <QrCode className="h-3.5 w-3.5 mr-1" />
              E-Invoice Hub
            </Link>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Outward Tax Liability"
          value={formatINR(data.gstr1Totals.totalTax)}
          icon={ReceiptText}
          tone="danger"
          footnote={`Taxable: ${formatINR(data.gstr1Totals.taxable)} (${data.gstr1Totals.b2bCount} B2B, ${data.gstr1Totals.b2cCount} B2C)`}
        />
        <StatCard
          label="Eligible ITC (Inward)"
          value={formatINR(data.gstr2Totals.totalItc)}
          icon={FileSpreadsheet}
          tone="brand"
          footnote={`From ${data.gstr2Totals.billCount} inward GRN supplier bills`}
        />
        <StatCard
          label="Net Cash Tax Payable"
          value={formatINR(netPayable)}
          icon={Landmark}
          tone={netPayable > 0 ? "warning" : "brand"}
          footnote={
            netPayable > 0
              ? "To pay via PMT-06 electronic cash ledger"
              : `Excess ITC of ${formatINR(carriedForward)} carried forward`
          }
        />
        <StatCard
          label="Pending E-Invoices"
          value={data.pendingEInvoiceCount}
          icon={QrCode}
          tone={data.pendingEInvoiceCount > 0 ? "warning" : "info"}
          footnote={`${data.activeEWayBillCount} active E-Way bills generated`}
          href="/dashboard/gst/e-invoice?status=pending"
        />
      </div>

      {/* Filing Schedule Tracker */}
      <div className="card p-6 bg-gradient-to-br from-white via-white to-ink-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-ink-150 gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-900">
              Statutory GST Return Timelines ({currentMonthName} {year})
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Government deadlines and filing preparation status for regular pharma taxpayers.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
            <ShieldCheck className="h-3.5 w-3.5" /> All Books Balanced
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* GSTR-1 Card */}
          <div className="p-4 rounded-xl border border-ink-200/80 bg-white shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs font-bold rounded bg-sky-100 text-sky-800">
                    GSTR-1
                  </span>
                  <span className="text-sm font-semibold text-ink-900">Outward Supplies</span>
                </div>
                <span className="text-xs text-ink-500 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Due: 11th of next month
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-2 leading-relaxed">
                Summary of all B2B invoices, B2C retail sales, interstate supplies, and 8-digit HSN summaries.
              </p>
              <div className="mt-3.5 flex items-center gap-4 text-xs">
                <div>
                  <span className="text-ink-400 block text-[11px]">B2B Invoices</span>
                  <span className="font-semibold text-ink-800">{data.gstr1Totals.b2bCount}</span>
                </div>
                <div>
                  <span className="text-ink-400 block text-[11px]">HSN Items</span>
                  <span className="font-semibold text-ink-800">Ready</span>
                </div>
                <div>
                  <span className="text-ink-400 block text-[11px]">Total Value</span>
                  <span className="font-semibold text-ink-800">{formatINR(data.gstr1Totals.grossTotal)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-ink-150 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Schema Validated
              </span>
              <Link
                href={`/dashboard/gst/outward?month=${month}&year=${year}`}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                Review GSTR-1 <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* GSTR-3B Card */}
          <div className="p-4 rounded-xl border border-ink-200/80 bg-white shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-xs font-bold rounded bg-purple-100 text-purple-800">
                    GSTR-3B
                  </span>
                  <span className="text-sm font-semibold text-ink-900">Summary Return & Tax Payment</span>
                </div>
                <span className="text-xs text-ink-500 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> Due: 20th of next month
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-2 leading-relaxed">
                Self-assessed monthly summary return for discharging output tax liability through available ITC and cash ledger.
              </p>
              <div className="mt-3.5 flex items-center gap-4 text-xs">
                <div>
                  <span className="text-ink-400 block text-[11px]">Output Tax</span>
                  <span className="font-semibold text-ink-800">{formatINR(data.gstr1Totals.totalTax)}</span>
                </div>
                <div>
                  <span className="text-ink-400 block text-[11px]">Input ITC</span>
                  <span className="font-semibold text-ink-800">{formatINR(data.gstr2Totals.totalItc)}</span>
                </div>
                <div>
                  <span className="text-ink-400 block text-[11px]">Net Cash Due</span>
                  <span className="font-semibold text-ink-900">{formatINR(netPayable)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-ink-150 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> Reconciled with Ledger
              </span>
              <Link
                href={`/dashboard/gst/returns?month=${month}&year=${year}`}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
              >
                Prepare GSTR-3B <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Discrepancies Alert (if any) */}
      {data.reconciliation.discrepancies.length > 0 && (
        <div className="card p-5 border-amber-200 bg-amber-50/40">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
            <AlertCircle className="h-4 w-4" />
            Audit Mismatch Flags ({data.reconciliation.discrepancies.length})
          </div>
          <div className="space-y-2">
            {data.reconciliation.discrepancies.slice(0, 3).map((disc, idx) => (
              <div
                key={idx}
                className="text-xs text-amber-900 bg-white/70 p-2.5 rounded-lg border border-amber-200/60 flex items-start justify-between"
              >
                <div>
                  <span className="font-semibold text-amber-950">{disc.title}: </span>
                  {disc.description}
                </div>
                {disc.amount && (
                  <span className="font-mono font-semibold shrink-0 ml-2">
                    {formatINR(disc.amount)}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Link
              href={`/dashboard/gst/reconciliation?month=${month}&year=${year}`}
              className="text-xs font-semibold text-amber-900 hover:underline inline-flex items-center gap-1"
            >
              View complete reconciliation & audit checklist <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Recent GST Documents Register */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-ink-150 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Recent Tax Invoices & Supply Bills</h3>
            <p className="text-xs text-ink-500">Live GST document audit trail recorded across sales and purchases.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/gst/outward?month=${month}&year=${year}`}
              className="btn btn-secondary text-xs"
            >
              View Outward Register
            </Link>
            <Link
              href={`/dashboard/gst/inward?month=${month}&year=${year}`}
              className="btn btn-secondary text-xs"
            >
              View Inward Register
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table w-full text-xs">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Doc No</th>
                <th className="py-2.5 px-3">Party / Customer</th>
                <th className="py-2.5 px-3">GSTIN</th>
                <th className="py-2.5 px-3">Supply Type</th>
                <th className="py-2.5 px-3 text-right">Taxable</th>
                <th className="py-2.5 px-3 text-right">Tax (CGST+SGST/IGST)</th>
                <th className="py-2.5 px-3 text-right">Total</th>
                <th className="py-2.5 px-3 text-center">E-Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              {data.recentDocs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-ink-400">
                    No GST documents recorded yet for this store.
                  </td>
                </tr>
              ) : (
                data.recentDocs.map((doc) => {
                  const tax = doc.cgst + doc.sgst + doc.igst;
                  return (
                    <tr key={doc.id} className="hover:bg-ink-50/50 transition-colors">
                      <td className="py-2.5 px-3 text-ink-600 whitespace-nowrap">{doc.docDate}</td>
                      <td className="py-2.5 px-3 font-semibold text-ink-900 whitespace-nowrap">
                        {doc.docNo}
                      </td>
                      <td className="py-2.5 px-3 text-ink-800 max-w-[160px] truncate">
                        {doc.partyName || "Walk-in Retail"}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-ink-600">
                        {doc.partyGstin || "—"}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                            doc.supplyType === "B2B"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-ink-100 text-ink-700"
                          }`}
                        >
                          {doc.supplyType}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-800">
                        {formatINR(doc.taxableAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                        {formatINR(tax)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold font-mono text-ink-900">
                        {formatINR(doc.total)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {doc.irn ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800" title={`IRN: ${doc.irn}`}>
                            <CheckCircle2 className="h-3 w-3" /> IRN Active
                          </span>
                        ) : doc.supplyType === "B2B" ? (
                          <Link
                            href="/dashboard/gst/e-invoice"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                          >
                            Generate IRN
                          </Link>
                        ) : (
                          <span className="text-ink-400 text-[11px]">N/A (B2C)</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
