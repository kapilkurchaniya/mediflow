import { getSaleById } from "@/app/actions/sales";
import { notFound } from "next/navigation";
import { Printer, Receipt, User, Stethoscope, AlertOctagon, RotateCcw, FileText, ChevronRight, MessageSquare } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/app/components/ui";
import { formatINR, formatItemQuantity, formatISTDate, formatISTDateTime } from "@/lib/format";
import { can, requirePagePermission } from "@/server/rbac";
import { getIndianBusinessDate } from "@/server/domain/sales/cancel-sale";
import { buildWhatsAppDirectUrl, buildInvoiceWhatsAppMessage } from "@/lib/whatsapp";
import { buildWhatsAppDeepLink } from "@/lib/comms/whatsapp-link";
import { CancelSaleButton } from "./CancelSaleButton";
import { ReturnSaleButton } from "./ReturnSaleButton";

export const metadata = { title: "Invoice Details" };

export default async function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePagePermission("sale.view");
  const { id } = await params;
  const data = await getSaleById(id);

  if (!data) return notFound();

  const { sale, items, customer, store, returns = [], payments = [] } = data;
  const isCancelled = sale.status === "cancelled";
  const isPaid = !sale.creditAmount || sale.creditAmount <= 0;
  const isPartial = !isPaid && (sale.paidAmount ?? 0) > 0;

  const saleDate = new Date(sale.completedAt ?? sale.createdAt!);
  const isSameDay = getIndianBusinessDate(saleDate) === getIndianBusinessDate(new Date());
  const canCancel = can(ctx, "sale.cancel");
  const canReturn = can(ctx, "sale.return");
  const hasReturns = (sale.returnedAmount ?? 0) > 0 || items.some((item) => (item.returnedQty ?? 0) > 0);
  const availableReturnUnits = items.reduce((sum, item) => sum + Math.max(0, item.qty - (item.returnedQty ?? 0)), 0);

  const customerPhone = customer?.phone || sale.customerPhone;
  const whatsappUrl = customerPhone
    ? buildWhatsAppDirectUrl(
        customerPhone,
        buildInvoiceWhatsAppMessage({
          customerName: customer?.name || sale.customerName,
          storeName: store?.name || "MediFlow Pharmacy",
          invoiceNo: sale.invoiceNo,
          totalINR: formatINR(sale.totalAmount || 0),
          dateStr: formatISTDate(saleDate),
          itemCount: items.length,
        }),
      )
    : null;

  const whatsappDesktopUrl = customerPhone && sale.invoiceNo
    ? buildWhatsAppDeepLink({
        phone: customerPhone,
        text: buildInvoiceWhatsAppMessage({
          customerName: customer?.name || sale.customerName,
          storeName: store?.name || "MediFlow Pharmacy",
          invoiceNo: sale.invoiceNo,
          totalINR: formatINR(sale.totalAmount || 0),
          dateStr: formatISTDate(saleDate),
          itemCount: items.length,
        }),
        preferDesktop: true,
      })
    : null;

  return (
    <div className="page space-y-6">
      <PageHeader
        title={`Invoice ${sale.invoiceNo ?? "Draft"}`}
        description={`Raised on ${formatISTDateTime(saleDate, "long")}`}
        backHref="/dashboard/sales"
        actions={
          <div className="flex items-center gap-2">
            {!isCancelled && sale.status === "completed" && canReturn && availableReturnUnits > 0 && (
              <ReturnSaleButton saleId={sale.id} />
            )}
            {!isCancelled && sale.status === "completed" && (
              <CancelSaleButton
                saleId={sale.id}
                invoiceNo={sale.invoiceNo}
                isSameDay={isSameDay}
                canCancel={canCancel}
                hasReturns={hasReturns}
              />
            )}
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200"
                title="Send digital receipt directly to customer's WhatsApp"
              >
                <MessageSquare className="h-4 w-4 mr-1.5 text-emerald-600" /> WhatsApp Receipt
              </a>
            )}
            {whatsappDesktopUrl && (
              <a
                href={whatsappDesktopUrl}
                className="btn btn-ghost text-emerald-700 hover:bg-emerald-50"
                title="Open directly in WhatsApp Desktop app (whatsapp://send)"
              >
                WhatsApp Desktop
              </a>
            )}
            <Link
              href={`/dashboard/sales/${sale.id}/print?format=thermal`}
              className="btn btn-secondary"
            >
              <Printer className="h-4 w-4 mr-1.5" /> Thermal 80mm
            </Link>
            <Link
              href={`/dashboard/sales/${sale.id}/print?format=gst`}
              className="btn btn-primary"
            >
              <Receipt className="h-4 w-4 mr-1.5" /> A4 GST Invoice
            </Link>
          </div>
        }
      />

      {/* Prominent Cancellation Status Banner */}
      {isCancelled && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4.5 text-rose-950 shadow-xs space-y-2 animate-enter">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-rose-900 text-[15px]">
              <AlertOctagon className="h-5 w-5 text-rose-600" />
              <span>This sale invoice has been cancelled</span>
            </div>
            <span className="badge badge-danger text-[11.5px] uppercase font-bold tracking-wider px-2.5 py-1">
              Cancelled
            </span>
          </div>
          <div className="text-[13px] text-rose-800 space-y-0.5">
            <p>
              Cancelled on{" "}
              <strong>
                {sale.cancelledAt
                  ? formatISTDateTime(sale.cancelledAt, "long")
                  : "Same day"}
              </strong>
              {sale.cancelReason ? (
                <> &bull; Reason: <span className="font-semibold italic">&ldquo;{sale.cancelReason}&rdquo;</span></>
              ) : null}
            </p>
            <p className="text-[12px] text-rose-700/90">
              Inventory batches have been restored to shelf stock, the outward GST document is voided, customer loyalty points/credit reversed, and an exact reversing journal entry was posted.
            </p>
          </div>
        </div>
      )}

      {/* Top Status & Party Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Customer Card */}
        <div className="card p-4 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 text-ink-500 text-[12px] font-medium uppercase tracking-wider">
            <User className="h-4 w-4 text-brand-600" />
            <span>Customer Details</span>
          </div>
          <div className="text-[15px] font-bold text-ink-900">{customer?.name || "Walk-in Customer"}</div>
          {customer?.phone && (
            <div className="text-[13px] text-ink-600">
              Mobile: <span className="font-mono">{customer.phone}</span>
            </div>
          )}
          {customer?.gstin && (
            <div className="text-[12px] text-ink-500 font-mono">GSTIN: {customer.gstin}</div>
          )}
        </div>

        {/* Doctor / Prescription Card */}
        <div className="card p-4 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 text-ink-500 text-[12px] font-medium uppercase tracking-wider">
            <Stethoscope className="h-4 w-4 text-brand-600" />
            <span>Doctor Prescription</span>
          </div>
          <div className="text-[15px] font-bold text-ink-900">
            {sale.doctorName || <span className="text-ink-400 font-normal">Over The Counter (OTC)</span>}
          </div>
          <div className="text-[12.5px] text-ink-500">
            {sale.doctorName ? "Doctor registered on invoice" : "Self-prescribed / OTC consultation"}
          </div>
        </div>

        {/* Invoice Payment Status Card */}
        <div className="card p-4 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-ink-500 text-[12px] font-medium uppercase tracking-wider">
            <span>Payment Status</span>
            <span
              className={`badge badge-dot ${
                isCancelled
                  ? "badge-danger"
                  : isPaid
                  ? "badge-success"
                  : isPartial
                  ? "badge-warning"
                  : "badge-danger"
              }`}
            >
              {isCancelled ? "Cancelled" : isPaid ? "Fully Paid" : isPartial ? "Partially Paid" : "Unpaid Credit"}
            </span>
          </div>
          <div className={`text-2xl font-black num ${isCancelled ? "line-through text-ink-400" : "text-ink-900"}`}>
            {formatINR(sale.totalAmount)}
          </div>
          <div className="text-[12.5px] text-ink-500 flex justify-between">
            <span>Paid: {formatINR(sale.paidAmount ?? 0)}</span>
            {sale.creditAmount && sale.creditAmount > 0 ? (
              <span className={`font-semibold ${isCancelled ? "line-through text-ink-400" : "text-amber-700"}`}>
                Due: {formatINR(sale.creditAmount)}
              </span>
            ) : null}
          </div>
          {payments.length > 0 && (
            <div className="pt-2 border-t border-ink-150 flex flex-wrap gap-1.5 text-xs" data-testid="split-payments">
              {payments.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-ink-100 text-ink-700 font-mono text-[11px]"
                >
                  <span className="uppercase font-bold">{p.method}:</span> {formatINR(p.amount ?? 0)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Line Items Table */}
      <div className="card overflow-hidden shadow-xs">
        <div className="card-header !py-3 bg-ink-50/50 border-b border-ink-150">
          <h3 className="card-title text-[14px]">Billed Medicines ({items.length})</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item & Composition</th>
                <th>Batch / Expiry</th>
                <th className="text-center">Qty</th>
                <th className="text-right">MRP</th>
                <th className="text-right">Rate</th>
                <th className="text-center">GST %</th>
                <th className="text-right">Taxable</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="font-bold text-ink-900">{item.medicineName}</span>
                    {item.unitsPerPack > 1 && (
                      <div className="text-[11px] text-ink-500 font-mono">
                        1 {item.packUnit} = {item.unitsPerPack} {item.looseUnit}s
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="font-mono text-[12.5px] font-medium text-ink-800">{item.batchNo}</span>
                    <div className="cell-sub num">{item.expiryDate}</div>
                  </td>
                  <td className="text-center">
                    <span className="badge badge-neutral num font-bold">{formatItemQuantity(item)}</span>
                  </td>
                  <td className="text-right num text-ink-600">{formatINR(item.mrp)}</td>
                  <td className="text-right num text-ink-800">{formatINR(item.rate)}</td>
                  <td className="text-center num text-ink-600">{(item.gstRateBp ?? 0) / 100}%</td>
                  <td className="text-right num text-ink-700">{formatINR(item.taxableAmount)}</td>
                  <td className="text-right num font-bold text-ink-900">{formatINR(item.totalAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Financial Totals Breakdown Footer */}
        <div className="p-6 bg-ink-25 border-t border-ink-150 flex flex-col md:flex-row justify-between gap-6">
          <div className="space-y-1 text-[12.5px] text-ink-500">
            <p>Store: <strong>{store?.name}</strong></p>
            <p>GSTIN: <span className="font-mono">{store?.gstin || "Unregistered"}</span></p>
            <p>Drug License No: <span className="font-mono">{store?.drugLicenseNo || "N/A"}</span></p>
          </div>

          <div className="w-full md:w-80 space-y-2 text-[13px]">
            <div className="flex justify-between text-ink-600">
              <span>Gross Amount</span>
              <span className="num font-medium text-ink-800">{formatINR(sale.grossAmount)}</span>
            </div>
            {sale.discountAmount && sale.discountAmount > 0 ? (
              <div className="flex justify-between text-brand-700">
                <span>Discount</span>
                <span className="num font-medium">- {formatINR(sale.discountAmount)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-ink-600">
              <span>Taxable Value</span>
              <span className="num font-medium text-ink-800">{formatINR(sale.taxableAmount)}</span>
            </div>
            <div className="flex justify-between text-ink-600">
              <span>CGST</span>
              <span className="num font-medium text-ink-800">{formatINR(sale.cgst)}</span>
            </div>
            <div className="flex justify-between text-ink-600">
              <span>SGST</span>
              <span className="num font-medium text-ink-800">{formatINR(sale.sgst)}</span>
            </div>
            {sale.igst && sale.igst > 0 ? (
              <div className="flex justify-between text-ink-600">
                <span>IGST</span>
                <span className="num font-medium text-ink-800">{formatINR(sale.igst)}</span>
              </div>
            ) : null}
            {sale.roundOff && sale.roundOff !== 0 ? (
              <div className="flex justify-between text-ink-600">
                <span>Round Off</span>
                <span className="num font-medium">
                  {sale.roundOff > 0 ? "+" : ""}{formatINR(sale.roundOff)}
                </span>
              </div>
            ) : null}
            <div className="pt-2 border-t border-ink-200 flex justify-between items-baseline">
              <span className="font-bold text-ink-900 text-[14px]">Net Total</span>
              <span className="font-black text-brand-700 text-xl num">{formatINR(sale.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Returns & Credit Notes Section */}
      {returns.length > 0 && (
        <div className="card overflow-hidden shadow-xs border-amber-200">
          <div className="card-header !py-3 bg-amber-50/60 border-b border-amber-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-amber-700" />
              <h3 className="card-title text-[14px] text-amber-950 font-bold">
                Credit Notes & Returns Issued ({returns.length})
              </h3>
            </div>
            <span className="text-xs font-semibold text-amber-800">
              Total Returned: {formatINR(sale.returnedAmount ?? 0)}
            </span>
          </div>

          <div className="divide-y divide-ink-100">
            {returns.map((ret) => (
              <div
                key={ret.id}
                className="p-4 flex items-center justify-between gap-4 hover:bg-ink-25/50 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-ink-900 text-[14px]">
                      {ret.returnNo}
                    </span>
                    <span className="badge badge-neutral uppercase text-[10.5px]">
                      {ret.refundMethod}
                    </span>
                  </div>
                  <div className="text-[12px] text-ink-500">
                    Issued on {formatISTDateTime(ret.createdAt!, "short")} &bull; Reason:{" "}
                    <span className="italic text-ink-700 font-medium">&ldquo;{ret.reason}&rdquo;</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-bold text-amber-800 text-[15px] num">
                      {formatINR(ret.totalAmount)}
                    </div>
                    <div className="text-[11px] text-ink-400 num">
                      Taxable: {formatINR(ret.taxableAmount ?? 0)}
                    </div>
                  </div>
                  <Link
                    href={`/dashboard/sales/returns/${ret.id}/print`}
                    className="btn btn-secondary !py-1 !px-2.5 text-xs text-ink-800 flex items-center gap-1"
                  >
                    <FileText className="h-3.5 w-3.5 text-amber-600" />
                    Credit Note
                    <ChevronRight className="h-3 w-3 text-ink-400" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
