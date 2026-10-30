import Link from "next/link";
import {
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowLeft,
  Truck,
  ExternalLink,
} from "lucide-react";
import { PageHeader, StatCard } from "@/app/components/ui";
import { formatINR } from "@/lib/money";
import { getInwardSupplies, getTenantGstinsAction } from "@/app/actions/gst";
import { GstPeriodSelector } from "../GstPeriodSelector";

export const dynamic = "force-dynamic";

export default async function GstInwardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; gstin?: string }>;
}) {
  const resolved = await searchParams;
  const now = new Date();
  const month = resolved.month ? Number(resolved.month) : now.getMonth() + 1;
  const year = resolved.year ? Number(resolved.year) : now.getFullYear();
  const gstin = resolved.gstin?.trim() || undefined;

  const [gstr2, tenantGstins] = await Promise.all([
    getInwardSupplies({ month, year, gstin }),
    getTenantGstinsAction(),
  ]);

  const availableGstins = tenantGstins.map((g) => ({
    gstin: g.gstin,
    label: `${g.gstin} (${g.stateName} - ${g.storeNames.join(", ")})`,
  }));

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const currentMonthName = monthNames[month - 1];

  let eligibleItcCount = 0;
  let ineligibleItcCount = 0;
  let lostItcAmount = 0;

  for (const bill of gstr2.inwardSupplies) {
    if (bill.itcEligible) {
      eligibleItcCount++;
    } else {
      ineligibleItcCount++;
      lostItcAmount += bill.cgst + bill.sgst + bill.igst;
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        backHref="/dashboard/gst"
        eyebrow="Input Tax Credit (ITC / GSTR-2)"
        title="Inward Supplies & ITC Register"
        description={`Register of pharmaceutical supplier invoices, GST inwards, and claimable Input Tax Credit for ${currentMonthName} ${year}.${gstin ? ` (Filtered for GSTIN: ${gstin})` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <GstPeriodSelector
              month={month}
              year={year}
              selectedGstin={gstin}
              availableGstins={availableGstins}
            />
            <Link
              href={`/dashboard/gst/reconciliation?month=${month}&year=${year}${gstin ? `&gstin=${gstin}` : ""}`}
              className="btn btn-primary text-xs"
            >
              Reconcile with Books
            </Link>
          </div>
        }
      />

      {/* ITC Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Eligible ITC"
          value={formatINR(gstr2.totals.totalItc - lostItcAmount)}
          icon={FileSpreadsheet}
          tone="brand"
          footnote={`Claimable in Table 4(A)(5) of GSTR-3B`}
        />
        <StatCard
          label="Inward Taxable Value"
          value={formatINR(gstr2.totals.taxable)}
          tone="neutral"
          footnote={`Across ${gstr2.totals.billCount} GRN purchase bills`}
        />
        <StatCard
          label="Central ITC (CGST)"
          value={formatINR(gstr2.totals.cgst)}
          tone="neutral"
          footnote="Intrastate purchases"
        />
        <StatCard
          label="State ITC (SGST)"
          value={formatINR(gstr2.totals.sgst)}
          tone="neutral"
          footnote="Intrastate purchases"
        />
      </div>

      {/* Statutory ITC Rules Banner */}
      <div className="card p-4 bg-sky-50/50 border-sky-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <HelpCircle className="h-4 w-4 text-sky-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-sky-950">Section 16(2) CGST Compliance: </span>
            <span className="text-sky-900 leading-relaxed">
              ITC is strictly available only if the supplier has uploaded the invoice in their GSTR-1, and it is reflected in your GSTR-2B. Unregistered purchases cannot be claimed.
            </span>
          </div>
        </div>
        {ineligibleItcCount > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded shrink-0">
            <AlertCircle className="h-3.5 w-3.5" />
            {ineligibleItcCount} Unregistered ({formatINR(lostItcAmount)} unclaimed)
          </span>
        )}
      </div>

      {/* Inward Purchases Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-ink-150 bg-ink-50/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">
              Inward Purchase Register ({gstr2.inwardSupplies.length} Invoices)
            </h3>
            <p className="text-xs text-ink-500">
              Tax components captured automatically from posted Purchase GRNs.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table w-full text-xs">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Supplier Invoice No</th>
                <th className="py-2.5 px-3">Supplier Name</th>
                <th className="py-2.5 px-3">Supplier GSTIN</th>
                <th className="py-2.5 px-3 text-right">Taxable</th>
                <th className="py-2.5 px-3 text-right">CGST</th>
                <th className="py-2.5 px-3 text-right">SGST</th>
                <th className="py-2.5 px-3 text-right">IGST</th>
                <th className="py-2.5 px-3 text-right">Total Invoice</th>
                <th className="py-2.5 px-3 text-center">ITC Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              {gstr2.inwardSupplies.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-ink-400">
                    No inward purchases recorded for {currentMonthName} {year}.
                  </td>
                </tr>
              ) : (
                gstr2.inwardSupplies.map((bill) => (
                  <tr key={bill.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="py-2.5 px-3 text-ink-600 whitespace-nowrap">{bill.docDate}</td>
                    <td className="py-2.5 px-3 font-semibold text-ink-900 whitespace-nowrap">
                      {bill.docNo}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-ink-800">{bill.supplierName}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-ink-700">
                      {bill.supplierGstin || "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-ink-800">
                      {formatINR(bill.taxableAmount)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                      {formatINR(bill.cgst)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                      {formatINR(bill.sgst)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                      {formatINR(bill.igst)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-ink-900">
                      {formatINR(bill.total)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {bill.itcEligible ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" /> Eligible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                          <AlertCircle className="h-3 w-3" /> Ineligible
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
