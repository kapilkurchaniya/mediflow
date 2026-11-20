import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { renderBillingTemplate, type BillingTemplateContext } from "@/server/domain/sales/template-engine";
import { getSaleById } from "@/app/actions/sales";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Printer, Receipt, AlertCircle, MessageSquare } from "lucide-react";
import Link from "next/link";
import PrintButton from "./PrintButton";
import { formatINR, formatItemQuantity, formatItemQuantityCompact } from "@/lib/format";
import { requirePagePermission } from "@/server/rbac";
import { buildWhatsAppDirectUrl, buildInvoiceWhatsAppMessage } from "@/lib/whatsapp";
import { QrCode } from "@/app/components/QrCode";
import { PrintWatermark } from "@/app/components/PrintWatermark";

export default async function PrintInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ format?: string }>;
}) {
  await requirePagePermission("sale.view");
  const resolvedParams = await params;
  const { format: printFormatParam } = await searchParams;

  const data = await getSaleById(resolvedParams.id);
  if (!data) return notFound();

  const { sale, items, customer, store, tenant, gstDoc, payments } = data;
  const storeDefaultFormat = store?.settings?.printFormat ?? "a4";
  const isThermal = printFormatParam
    ? printFormatParam === "thermal"
    : storeDefaultFormat === "thermal_80mm" || storeDefaultFormat === "thermal_58mm";
  const targetTemplateFormat = isThermal ? "thermal_80mm" : "a4";

  const [customTemplate] = store
    ? await db
        .select({ htmlContent: schema.billingTemplates.htmlContent })
        .from(schema.billingTemplates)
        .where(
          and(
            eq(schema.billingTemplates.tenantId, sale.tenantId),
            eq(schema.billingTemplates.storeId, store.id),
            eq(schema.billingTemplates.format, targetTemplateFormat),
            eq(schema.billingTemplates.isActive, true),
          ),
        )
        .limit(1)
    : [undefined];

  const isSimulated = !gstDoc?.einvoiceProvider || gstDoc.einvoiceProvider === "SIMULATOR";

  let customRenderedHtml: string | null = null;
  if (customTemplate) {
    const paymentSummary =
      payments.length > 0
        ? payments.map((p) => `${p.method.toUpperCase()}: ${formatINR(p.amount)}`).join(", ")
        : sale.creditAmount > 0
        ? `Credit Due: ${formatINR(sale.creditAmount)}`
        : `Paid: ${formatINR(sale.paidAmount || sale.totalAmount)}`;

    const tplCtx: BillingTemplateContext = {
      store: {
        name: store?.name || tenant?.name || "MediFlow Pharmacy",
        legalName: tenant?.legalName || tenant?.name || "",
        address: store?.address || "",
        city: store?.city || "",
        pincode: store?.pincode || "",
        phone: store?.phone || tenant?.phone || "",
        gstin: store?.gstin || tenant?.gstin || "N/A",
        drugLicenseNo: store?.drugLicenseNo || "N/A",
        fssaiNo: store?.fssaiNo || "",
      },
      sale: {
        invoiceNo: sale.invoiceNo || "DRAFT",
        invoiceDate: format(new Date(sale.completedAt ?? sale.createdAt!), "dd MMM yyyy, hh:mm a"),
        customerName: customer?.name || sale.customerName || "Walk-in",
        customerPhone: customer?.phone || sale.customerPhone || "",
        doctorName: sale.doctorName || "",
        paymentSummary,
        isCancelled: sale.status === "cancelled",
      },
      totals: {
        subtotal: formatINR(sale.taxableAmount || 0),
        discount: formatINR(sale.discountAmount || 0),
        cgst: formatINR(sale.cgst || 0),
        sgst: formatINR(sale.sgst || 0),
        igst: formatINR(sale.igst || 0),
        roundOff: formatINR(sale.roundOff || 0),
        grandTotal: formatINR(sale.totalAmount || 0),
        amountInWords: formatINR(sale.totalAmount || 0),
      },
      gst: {
        irn: gstDoc?.irn || "",
        ackNo: gstDoc?.ackNo || "",
        qrDataUrl: "",
      },
      items: items.map((it, idx) => ({
        sno: idx + 1,
        name: it.medicineName,
        hsn: it.hsn || "",
        batchNo: it.batchNo || "",
        expiry: it.expiryDate || "",
        qtyFormatted: formatItemQuantity({
          qty: it.qty,
          packQty: it.packQty,
          looseQty: it.looseQty,
          unitsPerPack: it.unitsPerPack,
          packUnit: it.packUnit,
          looseUnit: it.looseUnit,
        }),
        mrp: formatINR(it.mrp || 0),
        rate: formatINR(it.rate || 0),
        discount: formatINR(it.discountAmount || 0),
        gstPct: `${(it.gstRateBp || 0) / 100}%`,
        amount: formatINR(it.totalAmount || 0),
      })),
    };
    customRenderedHtml = renderBillingTemplate(customTemplate.htmlContent, tplCtx);
  }

  const customerPhone = customer?.phone || sale.customerPhone;
  const whatsappUrl = customerPhone
    ? buildWhatsAppDirectUrl(
        customerPhone,
        buildInvoiceWhatsAppMessage({
          customerName: customer?.name || sale.customerName,
          storeName: store?.name || tenant?.name || "MediFlow Pharmacy",
          invoiceNo: sale.invoiceNo,
          totalINR: formatINR(sale.totalAmount || 0),
          dateStr: format(new Date(sale.completedAt ?? sale.createdAt!), "dd MMM yyyy"),
          itemCount: items.length,
        }),
      )
    : null;

  return (
    <div className="min-h-screen bg-ink-100 py-6 px-4 font-sans text-ink-900 print:bg-white print:p-0 print:m-0 print:min-h-0">
      {!isThermal && <PrintWatermark />}
      {/* Dynamic print page styling tailored for 80mm thermal roll vs A4 GST Tax invoice */}
      <style
        dangerouslySetInnerHTML={{
          __html: isThermal
            ? `@media print {
                @page { size: 80mm auto; margin: 2mm 3mm; }
                body { margin: 0 !important; padding: 0 !important; }
                #invoice-printable { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
              }`
            : `@media print {
                @page { size: A4 portrait; margin: 8mm; }
                body { margin: 0 !important; padding: 0 !important; }
                #invoice-printable { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
              }`,
        }}
      />

      {/* Top action bar (hidden during print) */}
      <div className="max-w-3xl mx-auto mb-6 flex flex-wrap gap-3 justify-between items-center print:hidden">
        <Link
          href={`/dashboard/sales/${sale.id}`}
          className="flex items-center text-ink-600 hover:text-brand-700 transition-colors font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Invoice
        </Link>

        {/* Format Selector */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-ink-200 shadow-xs">
          <Link
            href={`/dashboard/sales/${sale.id}/print?format=thermal`}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
              isThermal ? "bg-brand-600 text-white shadow-2xs" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <Printer className="w-3.5 h-3.5" /> 80mm Thermal Slip
          </Link>
          <Link
            href={`/dashboard/sales/${sale.id}/print?format=gst`}
            className={`px-3 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 ${
              !isThermal ? "bg-brand-600 text-white shadow-2xs" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <Receipt className="w-3.5 h-3.5" /> Full A4 GST Invoice
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary text-xs flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200"
              title="Send digital receipt directly to customer's WhatsApp"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> Share WhatsApp
            </a>
          )}
          <PrintButton />
        </div>
      </div>

      {customRenderedHtml ? (
        <div
          id="invoice-printable"
          className={
            isThermal
              ? "max-w-[80mm] mx-auto bg-white p-3 shadow-xl border border-ink-200 print:shadow-none print:border-none print:p-0 print:m-0 thermal-slip"
              : "max-w-3xl mx-auto bg-white p-6 shadow-xl border border-ink-200 print:shadow-none print:border-none print:p-0 print:m-0"
          }
          dangerouslySetInnerHTML={{ __html: customRenderedHtml }}
        />
      ) : isThermal ? (
        /* ──────────────── 80mm Thermal POS Slip Format ──────────────── */
        <div
          id="invoice-printable"
          className="max-w-[80mm] mx-auto bg-white p-4 shadow-xl border border-ink-200 print:shadow-none print:border-none print:p-0 print:m-0 font-mono text-[11px] leading-tight text-black thermal-slip"
        >
          {/* Pharmacy Header */}
          <div className="text-center pb-2 border-b border-dashed border-black">
            <h1 className="text-[14px] font-black uppercase tracking-tight">{tenant?.name}</h1>
            <p className="text-[11px] font-semibold">{store?.name}</p>
            <p className="text-[10px]">{store?.address || "Pharmacy Store"}</p>
            <p className="text-[10px]">GSTIN: {store?.gstin || "N/A"}</p>
            <p className="text-[10px]">DL: {store?.drugLicenseNo || "N/A"}</p>
          </div>

          {/* Bill Info */}
          <div className="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
            <div className="flex justify-between">
              <span>Inv: {sale.invoiceNo}</span>
              <span>{format(new Date(sale.completedAt ?? sale.createdAt!), "dd/MM/yy HH:mm")}</span>
            </div>
            <div>Cust: {customer?.name || "Walk-in"}</div>
            {customer?.phone && <div>Phone: {customer.phone}</div>}
            {sale.doctorName && <div>Doctor: {sale.doctorName}</div>}
          </div>
          {gstDoc?.irn && (
            <div className="py-1 border-b border-dashed border-black text-[9px] text-center">
              {isSimulated && <p className="font-bold">*** SIMULATED IRN – NOT A VALID E-INVOICE ***</p>}
              <p className="font-mono break-all text-[8px]">IRN: {gstDoc.irn}</p>
              {gstDoc.ackNo && <p>Ack: {gstDoc.ackNo}</p>}
            </div>
          )}

          {/* Items Header */}
          <table className="w-full my-2 text-[10px] text-left border-collapse">
            <thead>
              <tr className="border-b border-black">
                <th className="py-1">Item/Batch</th>
                <th className="py-1 text-center">Qty</th>
                <th className="py-1 text-right">Rate</th>
                <th className="py-1 text-right">Amt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dotted divide-gray-400">
              {items.map((item, idx) => {
                const upp = Math.max(1, item.unitsPerPack ?? 1);
                const isLooseOnly = upp > 1 && (item.packQty === 0 || (!item.packQty && item.qty < upp));
                const unitRatePaise = isLooseOnly ? Math.round(item.rate / upp) : item.rate;
                return (
                  <tr key={idx}>
                    <td className="py-1">
                      <div className="font-bold truncate max-w-[120px]">{item.medicineName}</div>
                      <div className="text-[9px] text-gray-700">
                        B:{item.batchNo} E:{item.expiryDate?.slice(0, 7)}
                      </div>
                    </td>
                    <td className="py-1 text-center font-bold">
                      {formatItemQuantityCompact(item)}
                    </td>
                    <td className="py-1 text-right num">
                      ₹{(unitRatePaise / 100).toFixed(2)}
                      {isLooseOnly ? <span className="block text-[8px] text-gray-600">/{item.looseUnit?.slice(0, 3) || "tab"}</span> : null}
                    </td>
                    <td className="py-1 text-right font-bold num">₹{(item.totalAmount / 100).toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="pt-2 border-t border-dashed border-black text-[10px] space-y-1">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="num">₹{(sale.grossAmount / 100).toFixed(2)}</span>
            </div>
            {sale.discountAmount && sale.discountAmount > 0 ? (
              <div className="flex justify-between">
                <span>Discount:</span>
                <span className="num">-₹{(sale.discountAmount / 100).toFixed(2)}</span>
              </div>
            ) : null}
            <div className="flex justify-between">
              <span>GST Included:</span>
              <span className="num">₹{(((sale.cgst ?? 0) + (sale.sgst ?? 0) + (sale.igst ?? 0)) / 100).toFixed(2)}</span>
            </div>
            {sale.roundOff && sale.roundOff !== 0 ? (
              <div className="flex justify-between">
                <span>Round Off:</span>
                <span className="num">{sale.roundOff > 0 ? "+" : ""}₹{(sale.roundOff / 100).toFixed(2)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-[13px] font-black border-t border-black pt-1 mt-1">
              <span>NET PAYABLE:</span>
              <span className="num">₹{(sale.totalAmount / 100).toFixed(2)}</span>
            </div>
          </div>

          {/* Thermal E-Invoice Section */}
          {gstDoc?.irn && (
            <div className="py-2.5 my-2 border-t border-dashed border-black text-center space-y-1">
              <div className="text-[8px] font-mono font-bold uppercase tracking-wider text-gray-800">
                {isSimulated ? "[SIMULATED E-INVOICE]" : "GST E-INVOICE QR"}
              </div>
              <div className="flex justify-center my-1">
                {isSimulated ? (
                  <div className="p-2 border border-dashed border-gray-400 text-[8px] font-mono text-gray-500">
                    [SIMULATED QR]
                  </div>
                ) : (
                  <QrCode value={gstDoc.signedQrCode || gstDoc.irn} size={84} />
                )}
              </div>
              <div className="text-[7.5px] font-mono text-gray-700 break-all leading-tight">
                IRN: {gstDoc.irn.slice(0, 24)}...
              </div>
            </div>
          )}

          {/* Thermal Footer */}
          <div className="text-center pt-2 border-t border-dashed border-black text-[9px] space-y-1">
            <p>Thank you! Get well soon.</p>
            <p className="font-sans text-[8px] text-gray-500">MediFlow Cloud POS</p>
          </div>
        </div>
      ) : (
        /* ──────────────── Full A4 GST Tax Invoice Format ──────────────── */
        <div
          id="invoice-printable"
          className="max-w-3xl mx-auto bg-white p-8 sm:p-12 shadow-xl rounded-xl border border-ink-200 print:shadow-none print:p-0 print:border-none print:rounded-none print:m-0"
        >
          {/* Header Section */}
          <div className="flex justify-between items-start border-b border-ink-200 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-black text-brand-800 tracking-tight mb-1">{tenant?.name}</h1>
              <p className="text-ink-700 font-semibold text-sm">{store?.name}</p>
              <p className="text-ink-500 text-xs mt-0.5">{store?.address || "Address not provided"}</p>
              <div className="flex gap-4 text-xs font-mono text-ink-600 mt-2">
                <span><strong>GSTIN:</strong> {store?.gstin || "Unregistered"}</span>
                <span><strong>DL No:</strong> {store?.drugLicenseNo || "N/A"}</span>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-ink-900 tracking-tight">TAX INVOICE</h2>
              <div className="mt-2 bg-ink-50 rounded-lg p-2.5 border border-ink-150 text-left text-xs font-mono inline-block">
                <div><span className="text-ink-500">Invoice:</span> <strong>{sale.invoiceNo}</strong></div>
                <div className="mt-0.5"><span className="text-ink-500">Date:</span> {format(new Date(sale.completedAt ?? sale.createdAt!), "dd MMM yyyy, hh:mm a")}</div>
              </div>
            </div>
          </div>

          {/* Customer & Doctor Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6 bg-ink-50/70 p-4 rounded-lg border border-ink-150 text-xs">
            <div>
              <span className="font-bold text-ink-400 uppercase tracking-wider block mb-1">Billed To (Customer)</span>
              <p className="font-bold text-ink-900 text-sm">{customer?.name || "Walk-in Customer"}</p>
              {customer?.phone && <p className="text-ink-600 mt-0.5 font-mono">Mobile: +91 {customer.phone}</p>}
              {customer?.gstin && <p className="text-ink-600 font-mono">GSTIN: {customer.gstin}</p>}
            </div>
            <div className="text-right">
              <span className="font-bold text-ink-400 uppercase tracking-wider block mb-1">Prescription & Mode</span>
              <p className="font-bold text-ink-900 text-sm">{sale.doctorName || "Self-Prescribed / OTC"}</p>
              <p className="text-ink-600 capitalize mt-0.5">Payment: {sale.status === "completed" ? "Paid (Retail POS)" : sale.status}</p>
            </div>
          </div>

          {/* E-Invoice Verification & QR Section for A4 Format */}
          {gstDoc?.irn && (
            <div
              className={`mb-6 p-4 rounded-xl border text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                isSimulated
                  ? "border-dashed border-rose-300 bg-rose-50/70"
                  : "border-brand-200 bg-brand-50/40 shadow-xs"
              }`}
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wide">
                  {isSimulated ? (
                    <>
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span className="text-rose-800">SIMULATED IRN – NOT A VALID E-INVOICE</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shrink-0 animate-pulse" />
                      <span className="text-brand-900 font-extrabold tracking-tight">
                        NIC GST E-INVOICE SYSTEM · AUTHENTICATED
                      </span>
                      {gstDoc.einvoiceProvider && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-brand-100 text-brand-800 border border-brand-200">
                          {gstDoc.einvoiceProvider}
                        </span>
                      )}
                    </>
                  )}
                </div>
                <p className="font-mono text-[11px] text-ink-900 break-all pt-0.5">
                  <span className="font-bold text-ink-700">IRN:</span> {gstDoc.irn}
                </p>
                {gstDoc.ackNo && (
                  <p className="text-[11px] text-ink-600">
                    Ack No: <span className="font-mono font-semibold text-ink-900">{gstDoc.ackNo}</span> | Date:{" "}
                    {gstDoc.ackDate ? format(new Date(gstDoc.ackDate), "dd/MM/yyyy HH:mm") : "N/A"}
                  </p>
                )}
              </div>
              <div className="shrink-0 bg-white p-2 rounded-lg border border-ink-200 text-center shadow-2xs">
                {isSimulated ? (
                  <div className="px-3 py-4 text-center">
                    <span className="text-[10px] font-mono text-rose-700 font-bold block uppercase leading-snug">
                      [Simulated<br />IRN / QR]
                    </span>
                  </div>
                ) : (
                  <QrCode value={gstDoc.signedQrCode || gstDoc.irn} size={96} />
                )}
              </div>
            </div>
          )}

          {/* Items Table */}
          <div className="mb-6 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-brand-50 border-y border-brand-100 text-brand-900 font-bold">
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Item Name</th>
                  <th className="py-2.5 px-3">Batch</th>
                  <th className="py-2.5 px-3 text-center">Exp</th>
                  <th className="py-2.5 px-3 text-center">Qty</th>
                  <th className="py-2.5 px-3 text-right">MRP</th>
                  <th className="py-2.5 px-3 text-right">Rate</th>
                  <th className="py-2.5 px-3 text-center">GST</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-150">
                {items.map((item, idx) => {
                  const upp = Math.max(1, item.unitsPerPack ?? 1);
                  const isLooseOnly = upp > 1 && (item.packQty === 0 || (!item.packQty && item.qty < upp));
                  const unitRatePaise = isLooseOnly ? Math.round(item.rate / upp) : item.rate;
                  return (
                    <tr key={idx} className="hover:bg-ink-50">
                      <td className="py-2.5 px-3 text-ink-400">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-ink-900">{item.medicineName}</span>
                        {upp > 1 && (
                          <div className="text-[10px] text-ink-500 font-mono">
                            1 {item.packUnit} = {item.unitsPerPack} {item.looseUnit}s
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-ink-700">{item.batchNo}</td>
                      <td className="py-2.5 px-3 text-center num text-ink-600">{item.expiryDate}</td>
                      <td className="py-2.5 px-3 text-center font-bold num text-ink-900">
                        {formatItemQuantity(item)}
                      </td>
                      <td className="py-2.5 px-3 text-right num text-ink-600">{formatINR(item.mrp)}</td>
                      <td className="py-2.5 px-3 text-right num text-ink-700">
                        {formatINR(unitRatePaise)}
                        {isLooseOnly ? (
                          <span className="text-[10px] text-ink-500 block">/{item.looseUnit}</span>
                        ) : (
                          <span className="text-[10px] text-ink-500 block">/{item.packUnit}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center num text-ink-600">{(item.gstRateBp ?? 0) / 100}%</td>
                      <td className="py-2.5 px-3 text-right font-bold text-ink-900 num">{formatINR(item.totalAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals & Signature Section */}
          <div className="flex flex-col md:flex-row justify-between items-start border-t border-ink-200 pt-6 gap-6 text-xs">
            <div className="w-full md:w-1/2 space-y-3">
              <div>
                <h4 className="font-bold text-ink-400 uppercase tracking-wider mb-1">Terms & Conditions</h4>
                <p className="text-ink-500 leading-relaxed text-[11px]">
                  1. Goods once sold will not be accepted without valid batch and expiry verification.<br />
                  2. Keep scheduled drugs and thermolabile medicines in refrigeration as directed.<br />
                  3. This is a computer generated GST tax invoice.
                </p>
              </div>
              <div className="pt-8">
                <div className="w-48 border-t border-ink-400 text-center pt-1 text-[11px] text-ink-600">
                  Authorised Signatory / Pharmacist
                </div>
              </div>
            </div>

            <div className="w-full md:w-1/3 bg-ink-50 p-4 rounded-xl border border-ink-150 space-y-1.5">
              <div className="flex justify-between text-ink-600">
                <span>Taxable Amount</span>
                <span className="font-medium num text-ink-900">{formatINR(sale.taxableAmount)}</span>
              </div>
              {sale.discountAmount && sale.discountAmount > 0 ? (
                <div className="flex justify-between text-brand-700">
                  <span>Discount</span>
                  <span className="font-medium num">- {formatINR(sale.discountAmount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-ink-600">
                <span>CGST</span>
                <span className="font-medium num text-ink-900">{formatINR(sale.cgst)}</span>
              </div>
              <div className="flex justify-between text-ink-600">
                <span>SGST</span>
                <span className="font-medium num text-ink-900">{formatINR(sale.sgst)}</span>
              </div>
              {sale.igst && sale.igst > 0 ? (
                <div className="flex justify-between text-ink-600">
                  <span>IGST</span>
                  <span className="font-medium num text-ink-900">{formatINR(sale.igst)}</span>
                </div>
              ) : null}
              {sale.roundOff && sale.roundOff !== 0 ? (
                <div className="flex justify-between text-ink-600">
                  <span>Round Off</span>
                  <span className="font-medium num">
                    {sale.roundOff > 0 ? "+" : ""}{formatINR(sale.roundOff)}
                  </span>
                </div>
              ) : null}

              <div className="pt-2 border-t border-ink-200 flex justify-between items-baseline">
                <span className="text-sm font-bold text-ink-900">Total Invoice Value</span>
                <span className="text-xl font-black text-brand-700 num">{formatINR(sale.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
