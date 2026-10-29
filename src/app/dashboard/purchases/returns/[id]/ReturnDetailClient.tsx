"use client";

import Link from "next/link";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import {
  Printer,
  ArrowLeft,
  FileText,
  Truck,
  RotateCcw,
  CheckCircle2,
  Calendar,
  User,
  ExternalLink,
} from "lucide-react";
import type { PurchaseReturnDetail } from "@/server/domain/purchasing/purchase-returns";

interface ReturnDetailClientProps {
  returnRecord: PurchaseReturnDetail;
}

export function ReturnDetailClient({ returnRecord }: ReturnDetailClientProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={`Debit Note ${returnRecord.returnNo}`}
        description={`Issued on ${new Date(returnRecord.createdAt).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })} against GRN ${returnRecord.purchaseNo}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/purchases/returns"
              className="btn btn-secondary inline-flex items-center gap-1.5 text-xs"
            >
              <ArrowLeft className="h-4 w-4" />
              All Returns
            </Link>
            <Link
              href={`/dashboard/purchases/returns/${returnRecord.id}/print`}
              target="_blank"
              className="btn btn-primary inline-flex items-center gap-1.5 text-xs"
            >
              <Printer className="h-4 w-4" />
              Print Debit Note
            </Link>
          </div>
        }
      />

      {/* Status Banner */}
      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <span className="font-semibold text-sm block">Debit Note Posted & Approved</span>
            <span>
              Inventory deducted from batch stock. Vendor ledger debited by {formatINR(returnRecord.totalAmount)}.
            </span>
          </div>
        </div>
        <span className="badge bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 font-mono text-xs">
          GST DEBIT NOTE
        </span>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Supplier Info */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
            <Truck className="h-4 w-4 text-primary" />
            Supplier Details
          </div>
          <div className="text-sm">
            <p className="font-bold text-foreground">{returnRecord.supplierName}</p>
            {returnRecord.supplierGstin && (
              <p className="text-xs font-mono text-muted-foreground mt-0.5">
                GSTIN: <span className="font-semibold text-foreground">{returnRecord.supplierGstin}</span>
              </p>
            )}
            {returnRecord.supplierPhone && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Phone: {returnRecord.supplierPhone}
              </p>
            )}
            {returnRecord.supplierAddress && (
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
                {returnRecord.supplierAddress}
              </p>
            )}
          </div>
        </div>

        {/* Linked GRN Info */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
            <FileText className="h-4 w-4 text-primary" />
            Original Purchase Reference
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">MediFlow GRN #:</span>
              <Link
                href={`/dashboard/purchases/${returnRecord.purchaseId}`}
                className="font-semibold text-primary hover:underline inline-flex items-center gap-1 num"
              >
                {returnRecord.purchaseNo}
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Supplier Invoice #:</span>
              <span className="font-semibold text-foreground num">
                {returnRecord.supplierInvoiceNo || "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reason for Return:</span>
              <span className="font-semibold text-foreground">
                {returnRecord.reason}
              </span>
            </div>
          </div>
        </div>

        {/* Audit Meta */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
            <Calendar className="h-4 w-4 text-primary" />
            Audit & Posting Info
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Issued At:</span>
              <span className="font-semibold text-foreground">
                {new Date(returnRecord.createdAt).toLocaleString("en-IN")}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created By:</span>
              <span className="font-semibold text-foreground flex items-center gap-1">
                <User className="h-3 w-3 text-muted-foreground" />
                {returnRecord.createdByName || "Pharmacist"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accounting Journal:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                Posted (Balanced)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b bg-muted/30">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Returned Items & Batch Deductions ({returnRecord.items.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Medicine</th>
                <th className="px-4 py-3">Batch #</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3 text-right">Return Qty</th>
                <th className="px-4 py-3 text-right">Unit Rate</th>
                <th className="px-4 py-3 text-right">Taxable</th>
                <th className="px-4 py-3 text-right">Tax (GST)</th>
                <th className="px-4 py-3 text-right">Total Debit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {returnRecord.items.map((item) => (
                <tr key={item.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {item.medicineName}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs num">
                    {item.batchNo}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {item.expiryDate}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-foreground num">
                    {item.qty}
                  </td>
                  <td className="px-4 py-3 text-right num text-xs">
                    {formatINR(item.rate)}
                  </td>
                  <td className="px-4 py-3 text-right num text-xs">
                    {formatINR(item.taxableAmount)}
                  </td>
                  <td className="px-4 py-3 text-right num text-xs text-muted-foreground">
                    {formatINR(item.taxAmount)}
                  </td>
                  <td className="px-4 py-3 text-right num font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatINR(item.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="flex justify-end">
        <div className="card p-5 w-full md:w-80 space-y-2 text-xs">
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">Taxable Value:</span>
            <span className="font-semibold num">{formatINR(returnRecord.taxableAmount)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">GST Reversal:</span>
            <span className="font-semibold num text-blue-600 dark:text-blue-400">
              {formatINR(returnRecord.taxAmount)}
            </span>
          </div>
          <div className="flex justify-between py-2 text-base font-bold border-t border-border">
            <span className="text-foreground">Total Debit Note:</span>
            <span className="text-emerald-600 dark:text-emerald-400 num">
              {formatINR(returnRecord.totalAmount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
