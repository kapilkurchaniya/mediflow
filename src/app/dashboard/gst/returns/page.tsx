import Link from "next/link";
import {
  Landmark,
  ReceiptText,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Calendar,
  FileCheck,
} from "lucide-react";
import { PageHeader, StatCard } from "@/app/components/ui";
import { formatINR } from "@/lib/money";
import { getOutwardSupplies, getInwardSupplies, getGstReconciliation } from "@/app/actions/gst";
import { GstPeriodSelector } from "../GstPeriodSelector";
import { ReturnsClientExport } from "./ReturnsClientExport";

export const dynamic = "force-dynamic";

export default async function GstReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const resolved = await searchParams;
  const now = new Date();
  const month = resolved.month ? Number(resolved.month) : now.getMonth() + 1;
  const year = resolved.year ? Number(resolved.year) : now.getFullYear();

  const [gstr1, gstr2, recon] = await Promise.all([
    getOutwardSupplies({ month, year }),
    getInwardSupplies({ month, year }),
    getGstReconciliation({ month, year }),
  ]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const currentMonthName = monthNames[month - 1];

  const netCashPayable = recon.netTaxPayable.total;

  const gstr3bSummary = {
    outwardTaxable: gstr1.totals.taxable,
    cgst: gstr1.totals.cgst,
    sgst: gstr1.totals.sgst,
    igst: gstr1.totals.igst,
    itcCgst: gstr2.totals.cgst,
    itcSgst: gstr2.totals.sgst,
    itcIgst: gstr2.totals.igst,
    cashCgst: recon.netTaxPayable.cgst,
    cashSgst: recon.netTaxPayable.sgst,
    cashIgst: recon.netTaxPayable.igst,
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        backHref="/dashboard/gst"
        eyebrow="Government Return Filing"
        title="GST Returns Hub & Filing Worksheets"
        description={`Government portal filing worksheets and GSTR-3B auto-computation for ${currentMonthName} ${year}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <GstPeriodSelector month={month} year={year} />
            <ReturnsClientExport
              month={month}
              year={year}
              gstr3bSummary={gstr3bSummary}
            />
          </div>
        }
      />

      {/* Top Filing Readiness Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="GSTR-1 Status"
          value="Ready to File"
          icon={FileCheck}
          tone="brand"
          footnote={`Due on 11th (${gstr1.b2b.length} B2B + ${gstr1.b2cs.length} B2C)`}
        />
        <StatCard
          label="GSTR-3B Cash Liability"
          value={formatINR(netCashPayable)}
          icon={Landmark}
          tone={netCashPayable > 0 ? "warning" : "brand"}
          footnote={netCashPayable > 0 ? "Due on 20th via PMT-06" : "Zero cash liability"}
        />
        <StatCard
          label="Claimable ITC (Purchases)"
          value={formatINR(gstr2.totals.totalItc)}
          icon={FileSpreadsheet}
          tone="info"
          footnote="Offsets output liability"
        />
        <StatCard
          label="ITC Carried Forward"
          value={formatINR(recon.itcCarriedForward.total)}
          tone="neutral"
          footnote="Transferred to next tax period"
        />
      </div>

      {/* GSTR-3B Table 3.1: Outward Supplies */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-ink-150 bg-ink-50/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">
              3.1 - Details of Outward Supplies & Inward Supplies Liable to Reverse Charge
            </h3>
            <p className="text-xs text-ink-500">
              Autofilled directly from your finalized sales registers.
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-100 text-brand-800">
            Table 3.1
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="table w-full text-xs">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                <th className="py-2.5 px-4">Nature of Supplies</th>
                <th className="py-2.5 px-4 text-right">Total Taxable Value</th>
                <th className="py-2.5 px-4 text-right">Integrated Tax</th>
                <th className="py-2.5 px-4 text-right">Central Tax</th>
                <th className="py-2.5 px-4 text-right">State/UT Tax</th>
                <th className="py-2.5 px-4 text-right">Cess</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              <tr className="hover:bg-ink-50/50">
                <td className="py-3 px-4 text-ink-900 font-medium">
                  (a) Outward taxable supplies (other than zero rated, nil rated and exempted)
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-ink-900">
                  {formatINR(gstr1.totals.taxable)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-ink-800">
                  {formatINR(gstr1.totals.igst)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-ink-800">
                  {formatINR(gstr1.totals.cgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-ink-800">
                  {formatINR(gstr1.totals.sgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-ink-400">₹0.00</td>
              </tr>
              <tr className="hover:bg-ink-50/50 text-ink-400">
                <td className="py-2.5 px-4">(b) Outward taxable supplies (zero rated)</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
                <td className="py-2.5 px-4 text-right font-mono">—</td>
                <td className="py-2.5 px-4 text-right font-mono">—</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
              </tr>
              <tr className="hover:bg-ink-50/50 text-ink-400">
                <td className="py-2.5 px-4">(c) Other outward supplies (Nil rated, exempted)</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
                <td className="py-2.5 px-4 text-right font-mono">—</td>
                <td className="py-2.5 px-4 text-right font-mono">—</td>
                <td className="py-2.5 px-4 text-right font-mono">—</td>
                <td className="py-2.5 px-4 text-right font-mono">—</td>
              </tr>
              <tr className="hover:bg-ink-50/50 text-ink-400">
                <td className="py-2.5 px-4">(d) Inward supplies (liable to reverse charge)</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* GSTR-3B Table 4: Eligible ITC */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-ink-150 bg-ink-50/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">4 - Eligible Input Tax Credit (ITC)</h3>
            <p className="text-xs text-ink-500">
              Captured from purchase invoices matching registered pharma distributors.
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-100 text-brand-800">
            Table 4
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="table w-full text-xs">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                <th className="py-2.5 px-4">Details</th>
                <th className="py-2.5 px-4 text-right">Integrated Tax</th>
                <th className="py-2.5 px-4 text-right">Central Tax</th>
                <th className="py-2.5 px-4 text-right">State/UT Tax</th>
                <th className="py-2.5 px-4 text-right">Cess</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              <tr className="hover:bg-ink-50/50">
                <td className="py-3 px-4 text-ink-900 font-semibold">
                  (A)(5) All other ITC (Inward purchases from registered suppliers)
                </td>
                <td className="py-3 px-4 text-right font-mono text-ink-800">
                  {formatINR(gstr2.totals.igst)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-ink-800">
                  {formatINR(gstr2.totals.cgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-ink-800">
                  {formatINR(gstr2.totals.sgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-ink-400">₹0.00</td>
              </tr>
              <tr className="hover:bg-ink-50/50 text-ink-400">
                <td className="py-2.5 px-4">(B) ITC Reversed (as per rule 38, 42 & 43)</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
                <td className="py-2.5 px-4 text-right font-mono">₹0.00</td>
              </tr>
              <tr className="bg-ink-50/80 font-bold border-t border-ink-200">
                <td className="py-3 px-4 text-ink-900">(C) Net ITC Available (A) - (B)</td>
                <td className="py-3 px-4 text-right font-mono text-brand-700">
                  {formatINR(gstr2.totals.igst)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-brand-700">
                  {formatINR(gstr2.totals.cgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-brand-700">
                  {formatINR(gstr2.totals.sgst)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-ink-400">₹0.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* GSTR-3B Table 6.1: Payment of Tax */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-ink-150 bg-ink-50/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">
              6.1 - Payment of Tax (Discharge of Liability)
            </h3>
            <p className="text-xs text-ink-500">
              Set-off of output liability against available ITC and final cash ledger debits.
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-brand-100 text-brand-800">
            Table 6.1
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="table w-full text-xs">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                <th className="py-2.5 px-4">Description</th>
                <th className="py-2.5 px-4 text-right">Total Tax Payable</th>
                <th className="py-2.5 px-4 text-right">Paid Through ITC</th>
                <th className="py-2.5 px-4 text-right font-bold text-ink-900">
                  Tax Paid in Cash (PMT-06)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              <tr className="hover:bg-ink-50/50">
                <td className="py-3 px-4 font-semibold text-ink-900">Integrated Tax</td>
                <td className="py-3 px-4 text-right font-mono">{formatINR(gstr1.totals.igst)}</td>
                <td className="py-3 px-4 text-right font-mono text-emerald-700">
                  {formatINR(Math.min(gstr1.totals.igst, gstr2.totals.igst))}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-red-600">
                  {formatINR(recon.netTaxPayable.igst)}
                </td>
              </tr>
              <tr className="hover:bg-ink-50/50">
                <td className="py-3 px-4 font-semibold text-ink-900">Central Tax</td>
                <td className="py-3 px-4 text-right font-mono">{formatINR(gstr1.totals.cgst)}</td>
                <td className="py-3 px-4 text-right font-mono text-emerald-700">
                  {formatINR(Math.min(gstr1.totals.cgst, gstr2.totals.cgst))}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-red-600">
                  {formatINR(recon.netTaxPayable.cgst)}
                </td>
              </tr>
              <tr className="hover:bg-ink-50/50">
                <td className="py-3 px-4 font-semibold text-ink-900">State/UT Tax</td>
                <td className="py-3 px-4 text-right font-mono">{formatINR(gstr1.totals.sgst)}</td>
                <td className="py-3 px-4 text-right font-mono text-emerald-700">
                  {formatINR(Math.min(gstr1.totals.sgst, gstr2.totals.sgst))}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-red-600">
                  {formatINR(recon.netTaxPayable.sgst)}
                </td>
              </tr>
              <tr className="bg-ink-50/80 font-bold border-t-2 border-ink-200">
                <td className="py-3.5 px-4 text-ink-900">Total Cash Due</td>
                <td className="py-3.5 px-4 text-right font-mono">{formatINR(gstr1.totals.totalTax)}</td>
                <td className="py-3.5 px-4 text-right font-mono text-emerald-700">
                  {formatINR(
                    Math.min(gstr1.totals.igst, gstr2.totals.igst) +
                      Math.min(gstr1.totals.cgst, gstr2.totals.cgst) +
                      Math.min(gstr1.totals.sgst, gstr2.totals.sgst)
                  )}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-red-700 text-sm">
                  {formatINR(netCashPayable)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
