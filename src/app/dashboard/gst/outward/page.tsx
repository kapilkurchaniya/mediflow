import Link from "next/link";
import {
  ReceiptText,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  FileText,
  Boxes,
  ArrowLeft,
} from "lucide-react";
import { PageHeader, StatCard } from "@/app/components/ui";
import { formatINR } from "@/lib/money";
import { getOutwardSupplies } from "@/app/actions/gst";
import { GstPeriodSelector } from "../GstPeriodSelector";
import { Gstr1ExportActions } from "./Gstr1ExportActions";

export const dynamic = "force-dynamic";

export default async function Gstr1OutwardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; tab?: string }>;
}) {
  const resolved = await searchParams;
  const now = new Date();
  const month = resolved.month ? Number(resolved.month) : now.getMonth() + 1;
  const year = resolved.year ? Number(resolved.year) : now.getFullYear();
  const activeTab = resolved.tab || "b2b";

  const gstr1 = await getOutwardSupplies({ month, year });

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const currentMonthName = monthNames[month - 1];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        backHref="/dashboard/gst"
        eyebrow="Government Returns (GSTR-1)"
        title="Outward Supplies Statement"
        description={`Statement of outward supplies of medicines and health products for ${currentMonthName} ${year}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <GstPeriodSelector month={month} year={year} />
            <Gstr1ExportActions
              month={month}
              year={year}
              b2bData={gstr1.b2b}
              hsnData={gstr1.hsnSummary}
            />
          </div>
        }
      />

      {/* Outward Tax Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Taxable Value"
          value={formatINR(gstr1.totals.taxable)}
          icon={ReceiptText}
          tone="brand"
          footnote={`Gross supply: ${formatINR(gstr1.totals.grossTotal)}`}
        />
        <StatCard
          label="Central Tax (CGST)"
          value={formatINR(gstr1.totals.cgst)}
          tone="neutral"
          footnote="Intrastate supplies"
        />
        <StatCard
          label="State Tax (SGST)"
          value={formatINR(gstr1.totals.sgst)}
          tone="neutral"
          footnote="Intrastate supplies"
        />
        <StatCard
          label="Integrated Tax (IGST)"
          value={formatINR(gstr1.totals.igst)}
          tone="neutral"
          footnote="Interstate supplies"
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-ink-150 pb-2">
        <Link
          href={`/dashboard/gst/outward?month=${month}&year=${year}&tab=b2b`}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "b2b"
              ? "bg-brand-600 text-white shadow-xs"
              : "text-ink-600 hover:bg-ink-100"
          }`}
        >
          Table 4: B2B Invoices ({gstr1.b2b.length})
        </Link>
        <Link
          href={`/dashboard/gst/outward?month=${month}&year=${year}&tab=b2cs`}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "b2cs"
              ? "bg-brand-600 text-white shadow-xs"
              : "text-ink-600 hover:bg-ink-100"
          }`}
        >
          Table 7: B2C Retail ({gstr1.b2cs.length})
        </Link>
        <Link
          href={`/dashboard/gst/outward?month=${month}&year=${year}&tab=hsn`}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "hsn"
              ? "bg-brand-600 text-white shadow-xs"
              : "text-ink-600 hover:bg-ink-100"
          }`}
        >
          Table 12: HSN Summary ({gstr1.hsnSummary.length})
        </Link>
        <Link
          href={`/dashboard/gst/outward?month=${month}&year=${year}&tab=docs`}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "docs"
              ? "bg-brand-600 text-white shadow-xs"
              : "text-ink-600 hover:bg-ink-100"
          }`}
        >
          Table 13: Docs Issued
        </Link>
      </div>

      {/* Tab 1: B2B Invoices */}
      {activeTab === "b2b" && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-ink-150 bg-ink-50/30 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">
                4A, 4B, 4C, 6B, 6C - B2B Invoices
              </h3>
              <p className="text-xs text-ink-500">
                Tax invoices issued to registered recipients (Wholesalers, Hospitals, Clinics).
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-ink-700 bg-white px-2.5 py-1 rounded border border-ink-200">
              {gstr1.b2b.length} Records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="table w-full text-xs">
              <thead>
                <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                  <th className="py-2.5 px-3">Invoice No</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Recipient Name</th>
                  <th className="py-2.5 px-3">GSTIN</th>
                  <th className="py-2.5 px-3">POS</th>
                  <th className="py-2.5 px-3 text-right">Taxable</th>
                  <th className="py-2.5 px-3 text-right">CGST</th>
                  <th className="py-2.5 px-3 text-right">SGST</th>
                  <th className="py-2.5 px-3 text-right">IGST</th>
                  <th className="py-2.5 px-3 text-right">Invoice Total</th>
                  <th className="py-2.5 px-3 text-center">IRN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-150">
                {gstr1.b2b.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-8 text-ink-400">
                      No B2B invoices recorded in this period. All sales were retail B2C.
                    </td>
                  </tr>
                ) : (
                  gstr1.b2b.map((inv) => (
                    <tr key={inv.id} className="hover:bg-ink-50/50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-ink-900 whitespace-nowrap">
                        {inv.docNo}
                      </td>
                      <td className="py-2.5 px-3 text-ink-600 whitespace-nowrap">{inv.docDate}</td>
                      <td className="py-2.5 px-3 font-medium text-ink-800">{inv.partyName}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-brand-700 font-semibold">
                        {inv.partyGstin}
                      </td>
                      <td className="py-2.5 px-3 text-ink-600">{inv.placeOfSupply}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-800">
                        {formatINR(inv.taxableAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                        {formatINR(inv.cgst)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                        {formatINR(inv.sgst)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                        {formatINR(inv.igst)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-ink-900">
                        {formatINR(inv.total)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {inv.irn ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800"
                            title={`IRN: ${inv.irn}`}
                          >
                            <CheckCircle2 className="h-3 w-3" /> Ready
                          </span>
                        ) : (
                          <Link
                            href="/dashboard/gst/e-invoice"
                            className="text-[10px] font-semibold text-amber-700 hover:underline"
                          >
                            Generate
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: B2CS Retail */}
      {activeTab === "b2cs" && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-ink-150 bg-ink-50/30 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">
                Table 7 - B2C (Small) Details
              </h3>
              <p className="text-xs text-ink-500">
                Aggregated retail sales to end customers, grouped by Place of Supply and GST tax rate.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="table w-full text-xs">
              <thead>
                <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Place of Supply</th>
                  <th className="py-2.5 px-3 text-center">Rate</th>
                  <th className="py-2.5 px-3 text-right">Taxable Value</th>
                  <th className="py-2.5 px-3 text-right">Central Tax (CGST)</th>
                  <th className="py-2.5 px-3 text-right">State Tax (SGST)</th>
                  <th className="py-2.5 px-3 text-right">Total Invoice Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-150">
                {gstr1.b2cs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-ink-400">
                      No retail B2C transactions in this period.
                    </td>
                  </tr>
                ) : (
                  gstr1.b2cs.map((item, idx) => (
                    <tr key={idx} className="hover:bg-ink-50/50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-ink-800">OE (Other than E-Com)</td>
                      <td className="py-2.5 px-3 text-ink-900 font-medium">{item.placeOfSupply}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-semibold">
                        {(item.taxRateBp / 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-800">
                        {formatINR(item.taxableAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                        {formatINR(item.cgst)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                        {formatINR(item.sgst)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-ink-900">
                        {formatINR(item.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: HSN Summary */}
      {activeTab === "hsn" && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-ink-150 bg-ink-50/30 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">
                Table 12 - HSN-wise Summary of Outward Supplies
              </h3>
              <p className="text-xs text-ink-500">
                Mandatory 6/8-digit Harmonized System of Nomenclature code breakdown for pharmaceuticals.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="table w-full text-xs">
              <thead>
                <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                  <th className="py-2.5 px-3">HSN Code</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3">UQC</th>
                  <th className="py-2.5 px-3 text-right">Total Qty</th>
                  <th className="py-2.5 px-3 text-right">Total Value</th>
                  <th className="py-2.5 px-3 text-right">Taxable Value</th>
                  <th className="py-2.5 px-3 text-right">Integrated Tax</th>
                  <th className="py-2.5 px-3 text-right">Central Tax</th>
                  <th className="py-2.5 px-3 text-right">State Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-150">
                {gstr1.hsnSummary.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-ink-400">
                      No HSN items to display.
                    </td>
                  </tr>
                ) : (
                  gstr1.hsnSummary.map((hsn, idx) => (
                    <tr key={idx} className="hover:bg-ink-50/50 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-ink-900">{hsn.hsn}</td>
                      <td className="py-2.5 px-3 text-ink-700 max-w-[200px] truncate">
                        {hsn.description}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-ink-600">{hsn.uqc}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-ink-800">
                        {hsn.totalQty.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-800">
                        {formatINR(hsn.totalValue)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-800">
                        {formatINR(hsn.taxableAmount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                        {formatINR(hsn.igst)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                        {formatINR(hsn.cgst)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink-600">
                        {formatINR(hsn.sgst)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Document Summary */}
      {activeTab === "docs" && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-ink-900 mb-1">
            Table 13 - Documents Issued During the Tax Period
          </h3>
          <p className="text-xs text-ink-500 mb-4">
            Official summary of numbered series issued, cancelled, and net submitted.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-ink-50 border border-ink-200">
              <span className="text-xs text-ink-500 block">Total Invoices Issued</span>
              <span className="text-xl font-bold font-mono text-ink-900 mt-1 block">
                {gstr1.docSummary.totalIssued}
              </span>
            </div>
            <div className="p-4 rounded-lg bg-ink-50 border border-ink-200">
              <span className="text-xs text-ink-500 block">Cancelled Invoices</span>
              <span className="text-xl font-bold font-mono text-red-600 mt-1 block">
                {gstr1.docSummary.cancelled}
              </span>
            </div>
            <div className="p-4 rounded-lg bg-ink-50 border border-ink-200">
              <span className="text-xs text-ink-500 block">Net Number of Invoices</span>
              <span className="text-xl font-bold font-mono text-brand-700 mt-1 block">
                {gstr1.docSummary.netIssued}
              </span>
            </div>
            <div className="p-4 rounded-lg bg-ink-50 border border-ink-200">
              <span className="text-xs text-ink-500 block">Document Range</span>
              <span className="text-xs font-mono font-semibold text-ink-800 mt-2 block truncate">
                {gstr1.docSummary.fromDocNo} → {gstr1.docSummary.toDocNo}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
