import Link from "next/link";
import {
  Scale,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  ArrowRight,
  Landmark,
} from "lucide-react";
import { PageHeader, StatCard } from "@/app/components/ui";
import { formatINR } from "@/lib/money";
import { getGstReconciliation } from "@/app/actions/gst";
import { GstPeriodSelector } from "../GstPeriodSelector";

export const dynamic = "force-dynamic";

export default async function GstReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const resolved = await searchParams;
  const now = new Date();
  const month = resolved.month ? Number(resolved.month) : now.getMonth() + 1;
  const year = resolved.year ? Number(resolved.year) : now.getFullYear();

  const recon = await getGstReconciliation({ month, year });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const currentMonthName = monthNames[month - 1];

  const netPayable = recon.netTaxPayable.total;
  const itcCarriedForward = recon.itcCarriedForward.total;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        backHref="/dashboard/gst"
        eyebrow="2A/2B & Books Matching"
        title="GST Reconciliation & Tax Netting"
        description={`Cross-verification of outward tax liability against inward Input Tax Credit (ITC) for ${currentMonthName} ${year}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <GstPeriodSelector month={month} year={year} />
            <Link
              href={`/dashboard/gst/returns?month=${month}&year=${year}`}
              className="btn btn-primary text-xs"
            >
              Proceed to GSTR-3B Filing
            </Link>
          </div>
        }
      />

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Output Tax Liability"
          value={formatINR(recon.outwardTaxLiability.total)}
          tone="danger"
          footnote="Payable on outward sales"
        />
        <StatCard
          label="Total Input Tax Credit (ITC)"
          value={formatINR(recon.inwardItcAvailable.total)}
          tone="brand"
          footnote="Available to offset liability"
        />
        <StatCard
          label="Net Cash Tax Payable"
          value={formatINR(netPayable)}
          tone={netPayable > 0 ? "warning" : "brand"}
          footnote={netPayable > 0 ? "Pay via GST PMT-06 challan" : "Fully covered by ITC"}
        />
        <StatCard
          label="ITC Carried Forward"
          value={formatINR(itcCarriedForward)}
          tone="info"
          footnote="Balance for subsequent tax periods"
        />
      </div>

      {/* Tax Netting Matrix */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-ink-150 bg-ink-50/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">
              Tax Head Netting Matrix (Section 49 CGST Act)
            </h3>
            <p className="text-xs text-ink-500">
              Statutory order of utilization: IGST credit offsets IGST, then CGST/SGST. CGST offsets CGST. SGST offsets SGST.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-brand-100 text-brand-800">
            <ShieldCheck className="h-3.5 w-3.5" /> Rule 88A Applied
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="table w-full text-xs">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                <th className="py-2.5 px-4">Tax Component</th>
                <th className="py-2.5 px-4 text-right">Output Liability (A)</th>
                <th className="py-2.5 px-4 text-right">Input ITC Available (B)</th>
                <th className="py-2.5 px-4 text-right">Net Tax Payable in Cash (A - B)</th>
                <th className="py-2.5 px-4 text-right">Excess ITC Carried Forward (B - A)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              <tr className="hover:bg-ink-50/50">
                <td className="py-3 px-4 font-semibold text-ink-900">Central Tax (CGST)</td>
                <td className="py-3 px-4 text-right font-mono font-medium text-ink-800">
                  {formatINR(recon.outwardTaxLiability.cgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-medium text-ink-800">
                  {formatINR(recon.inwardItcAvailable.cgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-red-600">
                  {formatINR(recon.netTaxPayable.cgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600">
                  {formatINR(recon.itcCarriedForward.cgst)}
                </td>
              </tr>
              <tr className="hover:bg-ink-50/50">
                <td className="py-3 px-4 font-semibold text-ink-900">State Tax (SGST)</td>
                <td className="py-3 px-4 text-right font-mono font-medium text-ink-800">
                  {formatINR(recon.outwardTaxLiability.sgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-medium text-ink-800">
                  {formatINR(recon.inwardItcAvailable.sgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-red-600">
                  {formatINR(recon.netTaxPayable.sgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600">
                  {formatINR(recon.itcCarriedForward.sgst)}
                </td>
              </tr>
              <tr className="hover:bg-ink-50/50">
                <td className="py-3 px-4 font-semibold text-ink-900">Integrated Tax (IGST)</td>
                <td className="py-3 px-4 text-right font-mono font-medium text-ink-800">
                  {formatINR(recon.outwardTaxLiability.igst)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-medium text-ink-800">
                  {formatINR(recon.inwardItcAvailable.igst)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-red-600">
                  {formatINR(recon.netTaxPayable.igst)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600">
                  {formatINR(recon.itcCarriedForward.igst)}
                </td>
              </tr>
              <tr className="bg-ink-50/80 font-bold border-t-2 border-ink-200">
                <td className="py-3.5 px-4 text-ink-900">Total Tax Liability</td>
                <td className="py-3.5 px-4 text-right font-mono text-ink-900">
                  {formatINR(recon.outwardTaxLiability.total)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-ink-900">
                  {formatINR(recon.inwardItcAvailable.total)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-red-700">
                  {formatINR(recon.netTaxPayable.total)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-emerald-700">
                  {formatINR(recon.itcCarriedForward.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Discrepancy & Health Checks */}
      <div className="card p-6">
        <div className="flex items-center justify-between pb-3 border-b border-ink-150">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Audit Discrepancies & Mismatch Checks</h3>
            <p className="text-xs text-ink-500">
              Automated validation against GST return rejection rules and missing credit parameters.
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-ink-100 text-ink-700">
            {recon.discrepancies.length} Check{recon.discrepancies.length === 1 ? "" : "s"} Flagged
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {recon.discrepancies.length === 0 ? (
            <div className="text-center py-8 text-ink-500 flex flex-col items-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
              <p className="font-semibold text-sm text-ink-900">Zero Reconciliation Errors Found</p>
              <p className="text-xs text-ink-400 mt-0.5">
                All B2B invoices have valid GSTINs, supplier invoices are properly tagged, and HSN codes are mapped.
              </p>
            </div>
          ) : (
            recon.discrepancies.map((d, i) => (
              <div
                key={i}
                className={`p-3.5 rounded-lg border flex items-start justify-between gap-3 ${
                  d.severity === "danger"
                    ? "bg-red-50/50 border-red-200 text-red-900"
                    : d.severity === "warning"
                    ? "bg-amber-50/50 border-amber-200 text-amber-900"
                    : "bg-sky-50/50 border-sky-200 text-sky-900"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold">{d.title}</h4>
                    <p className="text-xs mt-0.5 leading-relaxed opacity-90">{d.description}</p>
                  </div>
                </div>
                {d.amount && (
                  <span className="font-mono text-xs font-bold shrink-0">
                    {formatINR(d.amount)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
