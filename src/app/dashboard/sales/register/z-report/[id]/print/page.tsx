import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Printer, Receipt, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { requirePagePermission } from "@/server/rbac";
import { getZReport } from "@/server/domain/cash-sessions";
import { db } from "@/server/db";
import { formatINR } from "@/lib/format";
import PrintButton from "@/app/dashboard/sales/[id]/print/PrintButton";
import { PrintWatermark } from "@/app/components/PrintWatermark";

export const metadata = { title: "Print Z-Report (End-of-Shift Audit)" };

export default async function PrintZReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  const ctx = await requirePagePermission("register.manage");
  const resolvedParams = await params;
  const { format: printFormat } = await searchParams;
  const isThermal = printFormat !== "a4"; // default to 80mm thermal

  let report;
  try {
    report = await getZReport(db, ctx, resolvedParams.id);
  } catch {
    return notFound();
  }

  const { store, shift, cashDrawer, tenders, transactionCounts, generatedAt } = report;
  const difference = cashDrawer.difference ?? 0;

  return (
    <div className="min-h-screen bg-ink-100 py-6 px-4 font-sans text-ink-900 print:bg-white print:p-0 print:m-0 print:min-h-0">
      {!isThermal && <PrintWatermark />}
      {/* Dynamic print stylesheet */}
      <style
        dangerouslySetInnerHTML={{
          __html: isThermal
            ? `@media print {
                @page { size: 80mm auto; margin: 2mm 3mm; }
                body { margin: 0 !important; padding: 0 !important; }
                #report-printable { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
              }`
            : `@media print {
                @page { size: A4 portrait; margin: 10mm; }
                body { margin: 0 !important; padding: 0 !important; }
                #report-printable { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
              }`,
        }}
      />

      {/* Top action bar (hidden on print) */}
      <div className="max-w-2xl mx-auto mb-6 flex flex-wrap gap-3 justify-between items-center print:hidden">
        <Link
          href="/dashboard/sales/register"
          className="flex items-center text-ink-600 hover:text-brand-700 transition-colors font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Cash Register
        </Link>

        {/* Format Selector */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-ink-200 shadow-xs">
          <Link
            href={`/dashboard/sales/register/z-report/${shift.id}/print?format=thermal`}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
              isThermal ? "bg-rose-600 text-white shadow-2xs" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <Printer className="w-3.5 h-3.5" /> 80mm Thermal Slip
          </Link>
          <Link
            href={`/dashboard/sales/register/z-report/${shift.id}/print?format=a4`}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
              !isThermal ? "bg-rose-600 text-white shadow-2xs" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" /> A4 Closing Audit Sheet
          </Link>
        </div>

        <PrintButton />
      </div>

      {isThermal ? (
        /* ──────────────── 80mm Thermal POS Z-Report Format ──────────────── */
        <div
          id="report-printable"
          className="max-w-[80mm] mx-auto bg-white p-4 shadow-xl border border-ink-200 print:shadow-none print:border-none print:p-0 print:m-0 font-mono text-[11px] leading-tight text-black thermal-slip"
        >
          {/* Store Header */}
          <div className="text-center pb-2 border-b border-black">
            <h1 className="text-sm font-black uppercase tracking-wider">{store.name}</h1>
            {store.address && <p className="text-[10px]">{store.address}</p>}
            {store.city && <p className="text-[10px]">{store.city}</p>}
            {store.gstin && <p className="text-[10px] font-bold">GSTIN: {store.gstin}</p>}
            {store.drugLicenseNo && <p className="text-[10px]">D.L.: {store.drugLicenseNo}</p>}
            {store.phone && <p className="text-[10px]">Ph: {store.phone}</p>}
          </div>

          {/* Title & Metadata */}
          <div className="text-center py-2 border-b border-black">
            <div className="text-xs font-black uppercase tracking-widest bg-black text-white py-0.5 px-2 inline-block">
              === Z - REPORT ===
            </div>
            <div className="text-[10px] uppercase mt-1 font-bold">End-of-Shift Closing Audit</div>
            <div className="text-[9px] text-gray-700">(Drawer Status: CLOSED & LOCKED)</div>
          </div>

          <div className="py-2 border-b border-dashed border-gray-400 text-[10px] space-y-0.5">
            <div className="flex justify-between">
              <span>Shift ID:</span>
              <span className="font-bold">{shift.id.slice(0, 8)}</span>
            </div>
            <div className="flex justify-between">
              <span>Opened By:</span>
              <span>{shift.openedByName}</span>
            </div>
            <div className="flex justify-between">
              <span>Closed By:</span>
              <span className="font-bold">{shift.closedByName ?? shift.openedByName}</span>
            </div>
            <div className="flex justify-between">
              <span>Opened At:</span>
              <span>{format(new Date(shift.openedAt), "dd-MMM-yyyy hh:mm a")}</span>
            </div>
            <div className="flex justify-between">
              <span>Closed At:</span>
              <span>
                {shift.closedAt
                  ? format(new Date(shift.closedAt), "dd-MMM-yyyy hh:mm a")
                  : format(new Date(generatedAt), "dd-MMM-yyyy hh:mm a")}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Duration:</span>
              <span>{Math.floor(shift.durationMinutes / 60)}h {shift.durationMinutes % 60}m</span>
            </div>
          </div>

          {/* Cash Drawer Closing Reconciliation */}
          <div className="py-2 border-b border-black space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider border-b border-gray-300 pb-0.5">
              CLOSING DRAWER RECONCILIATION
            </div>
            <div className="flex justify-between text-[11px]">
              <span>Opening Cash Float:</span>
              <span className="font-bold">{formatINR(cashDrawer.openingCash)}</span>
            </div>
            <div className="flex justify-between text-[11px]">
              <span>(+) Cash Sales:</span>
              <span>{formatINR(cashDrawer.cashSales)}</span>
            </div>
            {cashDrawer.cashReceipts > 0 && (
              <div className="flex justify-between text-[11px]">
                <span>(+) Cash Receipts:</span>
                <span>{formatINR(cashDrawer.cashReceipts)}</span>
              </div>
            )}
            <div className="flex justify-between text-[11px]">
              <span>(-) Cash Returns:</span>
              <span>{formatINR(cashDrawer.cashRefunds)}</span>
            </div>
            {cashDrawer.cashCancels > 0 && (
              <div className="flex justify-between text-[11px]">
                <span>(-) Cash Cancellations:</span>
                <span>{formatINR(cashDrawer.cashCancels)}</span>
              </div>
            )}
            {cashDrawer.cashPayouts > 0 && (
              <div className="flex justify-between text-[11px]">
                <span>(-) Cash Payouts:</span>
                <span>{formatINR(cashDrawer.cashPayouts)}</span>
              </div>
            )}

            <div className="flex justify-between text-[11px] pt-1 border-t border-dashed border-gray-400 font-bold">
              <span>EXPECTED CASH:</span>
              <span>{formatINR(cashDrawer.expectedCash)}</span>
            </div>

            <div className="flex justify-between text-[11px] font-black pt-0.5">
              <span>COUNTED ACTUAL CASH:</span>
              <span>{formatINR(cashDrawer.actualCash ?? cashDrawer.expectedCash)}</span>
            </div>

            {/* Variance */}
            <div className="flex justify-between text-xs font-black pt-1 border-t-2 border-black">
              <span>VARIANCE:</span>
              <span>
                {difference === 0
                  ? "₹0.00 (BALANCED)"
                  : difference < 0
                  ? `${formatINR(difference)} (SHORT)`
                  : `+${formatINR(difference)} (OVER)`}
              </span>
            </div>
          </div>

          {/* Tender Breakdown */}
          <div className="py-2 border-b border-black space-y-1">
            <div className="text-[10px] font-black uppercase tracking-wider border-b border-gray-300 pb-0.5">
              TOTAL SALES BY TENDER
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Cash Sales:</span>
              <span>{formatINR(tenders.cash)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>UPI / QR:</span>
              <span>{formatINR(tenders.upi)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Card:</span>
              <span>{formatINR(tenders.card)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Bank Transfer:</span>
              <span>{formatINR(tenders.bank)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span>Store Credit:</span>
              <span>{formatINR(tenders.credit)}</span>
            </div>
            <div className="flex justify-between text-xs font-black pt-1 border-t border-dashed border-black">
              <span>TOTAL SALES BILLED:</span>
              <span>{formatINR(tenders.total)}</span>
            </div>
          </div>

          {/* Activity Counts */}
          <div className="py-2 border-b border-black text-[10px] space-y-0.5">
            <div className="text-[10px] font-black uppercase tracking-wider border-b border-gray-300 pb-0.5 mb-1">
              OPERATIONAL COUNTS
            </div>
            <div className="flex justify-between">
              <span>Completed Bills:</span>
              <span className="font-bold">{transactionCounts.sales}</span>
            </div>
            <div className="flex justify-between">
              <span>Customer Returns:</span>
              <span>{transactionCounts.returns}</span>
            </div>
            <div className="flex justify-between">
              <span>Cancelled Bills:</span>
              <span>{transactionCounts.cancels}</span>
            </div>
          </div>

          {/* Shift Notes & Denominations */}
          {shift.notes && (
            <div className="py-2 border-b border-black text-[10px] space-y-0.5">
              <div className="font-bold uppercase tracking-wider mb-0.5">CLOSING AUDIT NOTES:</div>
              <pre className="whitespace-pre-wrap font-mono text-[9px]">{shift.notes}</pre>
            </div>
          )}

          {/* Signature Block */}
          <div className="pt-6 pb-2 text-[10px] space-y-6">
            <div className="border-t border-black pt-1 flex justify-between">
              <span>Cashier Signature</span>
              <span>Supervisor / Manager</span>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center pt-2 text-[9px] text-gray-700 space-y-0.5">
            <p>*** TERMINAL SESSION CLOSED ***</p>
            <p className="font-sans text-[8px] text-gray-500 pt-1">MediFlow Pharma OS</p>
          </div>
        </div>
      ) : (
        /* ──────────────── A4 Portrait Z-Report Format ──────────────── */
        <div
          id="report-printable"
          className="max-w-[210mm] mx-auto bg-white p-8 shadow-xl border border-ink-200 print:shadow-none print:border-none print:p-0 text-ink-900"
        >
          {/* Header */}
          <div className="flex justify-between items-start pb-6 border-b border-ink-300">
            <div>
              <h1 className="text-2xl font-black text-ink-900 tracking-tight uppercase">{store.name}</h1>
              {store.address && <p className="text-sm text-ink-600 mt-1">{store.address}, {store.city}</p>}
              <div className="flex gap-4 text-xs text-ink-600 mt-2 font-mono">
                {store.gstin && <span>GSTIN: <strong>{store.gstin}</strong></span>}
                {store.drugLicenseNo && <span>D.L.: <strong>{store.drugLicenseNo}</strong></span>}
                {store.phone && <span>Ph: <strong>{store.phone}</strong></span>}
              </div>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 bg-rose-700 text-white font-black text-sm tracking-widest uppercase rounded">
                Z - REPORT
              </span>
              <div className="text-xs text-ink-500 uppercase mt-1">End-of-Shift Closing Audit</div>
              <div className="text-xs font-mono text-rose-700 font-semibold mt-0.5">■ Session CLOSED & LOCKED</div>
            </div>
          </div>

          {/* Shift Details Grid */}
          <div className="grid grid-cols-4 gap-4 py-4 border-b border-ink-200 text-xs">
            <div>
              <span className="text-ink-400 block uppercase tracking-wider text-[10px]">Shift ID</span>
              <span className="font-mono font-bold text-ink-900">{shift.id}</span>
            </div>
            <div>
              <span className="text-ink-400 block uppercase tracking-wider text-[10px]">Opened By / At</span>
              <span className="font-semibold text-ink-900 block">{shift.openedByName}</span>
              <span className="font-mono text-ink-600 text-[11px]">{format(new Date(shift.openedAt), "dd/MM/yyyy HH:mm")}</span>
            </div>
            <div>
              <span className="text-ink-400 block uppercase tracking-wider text-[10px]">Closed By / At</span>
              <span className="font-semibold text-ink-900 block">{shift.closedByName ?? shift.openedByName}</span>
              <span className="font-mono text-ink-600 text-[11px]">
                {shift.closedAt ? format(new Date(shift.closedAt), "dd/MM/yyyy HH:mm") : "—"}
              </span>
            </div>
            <div>
              <span className="text-ink-400 block uppercase tracking-wider text-[10px]">Shift Duration</span>
              <span className="font-mono text-ink-900 font-bold block">
                {Math.floor(shift.durationMinutes / 60)}h {shift.durationMinutes % 60}m
              </span>
            </div>
          </div>

          {/* Cash Drawer & Tenders Section */}
          <div className="grid grid-cols-2 gap-8 my-6">
            {/* Drawer Cash Flow */}
            <div className="border border-ink-200 rounded-xl p-5 bg-ink-50/30">
              <h3 className="font-bold text-sm uppercase tracking-wider text-ink-900 border-b border-ink-200 pb-2 mb-3">
                Drawer Reconciliation & Audit
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-600">Opening Float:</span>
                  <span className="font-mono font-bold text-ink-900">{formatINR(cashDrawer.openingCash)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>(+) Net Cash Sales:</span>
                  <span className="font-mono font-bold">{formatINR(cashDrawer.cashSales)}</span>
                </div>
                {cashDrawer.cashReceipts > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>(+) Cash Receipts:</span>
                    <span className="font-mono font-bold">{formatINR(cashDrawer.cashReceipts)}</span>
                  </div>
                )}
                <div className="flex justify-between text-rose-700">
                  <span>(-) Cash Returns:</span>
                  <span className="font-mono font-bold">{formatINR(cashDrawer.cashRefunds)}</span>
                </div>
                {cashDrawer.cashCancels > 0 && (
                  <div className="flex justify-between text-rose-700">
                    <span>(-) Cash Cancellations:</span>
                    <span className="font-mono font-bold">{formatINR(cashDrawer.cashCancels)}</span>
                  </div>
                )}
                {cashDrawer.cashPayouts > 0 && (
                  <div className="flex justify-between text-rose-700">
                    <span>(-) Cash Payouts:</span>
                    <span className="font-mono font-bold">{formatINR(cashDrawer.cashPayouts)}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm font-bold pt-3 border-t border-ink-200 text-ink-900">
                  <span>Expected Drawer Cash:</span>
                  <span className="font-mono text-ink-900">{formatINR(cashDrawer.expectedCash)}</span>
                </div>

                <div className="flex justify-between text-base font-black text-ink-900">
                  <span>Counted Actual Cash:</span>
                  <span className="font-mono text-ink-900">
                    {formatINR(cashDrawer.actualCash ?? cashDrawer.expectedCash)}
                  </span>
                </div>

                {/* Variance Display */}
                <div
                  className={`flex justify-between text-base font-black pt-3 border-t-2 ${
                    difference === 0
                      ? "border-emerald-500 text-emerald-800"
                      : difference < 0
                      ? "border-rose-500 text-rose-800"
                      : "border-amber-500 text-amber-800"
                  }`}
                >
                  <span>Drawer Variance:</span>
                  <span className="font-mono">
                    {difference === 0
                      ? "₹0.00 (EXACT MATCH)"
                      : difference < 0
                      ? `${formatINR(difference)} SHORT`
                      : `+${formatINR(difference)} OVER`}
                  </span>
                </div>
              </div>
            </div>

            {/* Sales Tenders */}
            <div className="border border-ink-200 rounded-xl p-5 bg-ink-50/30">
              <h3 className="font-bold text-sm uppercase tracking-wider text-ink-900 border-b border-ink-200 pb-2 mb-3">
                Shift Sales by Tender Method
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-600">Cash:</span>
                  <span className="font-mono text-ink-900">{formatINR(tenders.cash)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-600">UPI / QR:</span>
                  <span className="font-mono text-ink-900">{formatINR(tenders.upi)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-600">Card (Debit/Credit):</span>
                  <span className="font-mono text-ink-900">{formatINR(tenders.card)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-600">Bank Transfer / NEFT:</span>
                  <span className="font-mono text-ink-900">{formatINR(tenders.bank)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-600">Customer Credit (Khata):</span>
                  <span className="font-mono text-ink-900">{formatINR(tenders.credit)}</span>
                </div>
                <div className="flex justify-between text-base font-black pt-3 border-t-2 border-ink-300 text-ink-900">
                  <span>Total Sales Billed:</span>
                  <span className="font-mono">{formatINR(tenders.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes and Denominations */}
          {shift.notes && (
            <div className="border border-ink-200 rounded-xl p-4 text-xs bg-zinc-50 font-mono mb-6">
              <strong className="block text-ink-900 mb-1 uppercase tracking-wider">Audit Log & Denominations:</strong>
              <pre className="whitespace-pre-wrap">{shift.notes}</pre>
            </div>
          )}

          {/* Operational Counts */}
          <div className="border border-ink-200 rounded-xl p-4 text-xs flex justify-between bg-zinc-50 font-mono">
            <div>Completed Bills: <strong>{transactionCounts.sales}</strong></div>
            <div>Returns Processed: <strong>{transactionCounts.returns}</strong></div>
            <div>Cancellations: <strong>{transactionCounts.cancels}</strong></div>
            <div>Payout Vouchers: <strong>{transactionCounts.payouts}</strong></div>
            <div>Receipt Vouchers: <strong>{transactionCounts.receipts}</strong></div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 mt-16 pt-8 border-t border-ink-200 text-xs text-ink-600">
            <div>
              <div className="border-b border-ink-400 pb-1 mb-1" />
              <div className="font-bold text-ink-900">Cashier Signature ({shift.closedByName ?? shift.openedByName})</div>
              <div className="text-[11px] text-ink-500">I confirm that physical cash counted in drawer matches this audit statement.</div>
            </div>
            <div>
              <div className="border-b border-ink-400 pb-1 mb-1" />
              <div className="font-bold text-ink-900">Store Manager / Supervisor Signature</div>
              <div className="text-[11px] text-ink-500">Verified and approved shift closure and over/short variance.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
