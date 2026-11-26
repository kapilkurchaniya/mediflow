"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { recordSupplierPaymentAction } from "@/app/actions/suppliers";
import {
  CreditCard,
  ArrowLeft,
  Save,
  AlertCircle,
  Truck,
  CheckCircle2,
  Calendar,
} from "lucide-react";

interface OpenInvoice {
  id: string;
  purchaseNo: string;
  supplierInvoiceNo: string | null;
  invoiceDate: string;
  totalAmount: number | null;
  returnedAmount: number | null;
  netBillAmount: number;
}

interface SupplierPaymentClientProps {
  supplier: {
    id: string;
    name: string;
    gstin: string | null;
    closingBalance: number;
  };
  openInvoices: OpenInvoice[];
}

export function SupplierPaymentClient({
  supplier,
  openInvoices,
}: SupplierPaymentClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [amountRupees, setAmountRupees] = useState<string>(
    supplier.closingBalance > 0 ? (supplier.closingBalance / 100).toFixed(2) : ""
  );
  const [method, setMethod] = useState<"bank" | "upi" | "cash" | "card" | "cheque" | "neft" | "rtgs">("bank");
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split("T")[0]!
  );
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  function handleSelectInvoice(inv: OpenInvoice) {
    setSelectedInvoiceId(inv.id);
    setAmountRupees((inv.netBillAmount / 100).toFixed(2));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amountFloat = parseFloat(amountRupees);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      setError("Please enter a valid payment amount greater than zero.");
      return;
    }

    const amountPaise = Math.round(amountFloat * 100);

    startTransition(async () => {
      const res = await recordSupplierPaymentAction({
        supplierId: supplier.id,
        amount: amountPaise,
        method,
        paymentDate,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        purchaseId: selectedInvoiceId || undefined,
      });

      if (!res?.data?.success) {
        setError(res?.serverError || "Failed to record payment voucher");
      } else {
        router.push(`/dashboard/suppliers/${supplier.id}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PageHeader
        title={`Record Payment to ${supplier.name}`}
        description="Issue payment voucher, settle vendor invoices, and post double-entry journal (B2.4)"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/suppliers/${supplier.id}`}
              className="btn btn-secondary inline-flex items-center gap-1.5 text-xs"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Supplier
            </Link>
            <button
              type="submit"
              disabled={isPending}
              className="btn btn-primary inline-flex items-center gap-1.5 text-xs"
            >
              <Save className="h-4 w-4" />
              {isPending ? "Recording Payment..." : "Confirm Payment"}
            </button>
          </div>
        }
      />

      {error && (
        <div className="card border-red-300 bg-red-50 dark:bg-red-950/30 p-4 text-red-800 dark:text-red-200 text-sm flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Error recording payment</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Top Banner: Outstanding Payable */}
      <div className="card p-5 bg-muted/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
            Vendor Net Balance
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span
              className={`text-2xl font-bold num ${
                supplier.closingBalance > 0
                  ? "text-rose-600 dark:text-rose-400"
                  : supplier.closingBalance < 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground"
              }`}
            >
              {formatINR(Math.abs(supplier.closingBalance))}
            </span>
            <span className="text-xs text-muted-foreground">
              {supplier.closingBalance > 0
                ? "Total amount currently payable"
                : supplier.closingBalance < 0
                ? "Advance credit with vendor"
                : "No outstanding balance"}
            </span>
          </div>
        </div>

        {supplier.closingBalance > 0 && (
          <button
            type="button"
            onClick={() => setAmountRupees((supplier.closingBalance / 100).toFixed(2))}
            className="btn btn-secondary text-xs"
          >
            Pay Full Balance ({formatINR(supplier.closingBalance)})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Payment Details Form */}
        <div className="card p-5 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
            Payment Voucher Details
          </h3>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Payment Amount (₹) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              placeholder="0.00"
              className="input w-full text-lg font-bold num"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Payment Method *
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as "bank" | "upi" | "cash" | "card" | "cheque" | "neft" | "rtgs")}
                className="input w-full text-sm"
                required
              >
                <option value="bank">Bank Transfer</option>
                <option value="neft">NEFT</option>
                <option value="rtgs">RTGS</option>
                <option value="cheque">Cheque</option>
                <option value="upi">UPI / QR</option>
                <option value="cash">Cash</option>
                <option value="card">Corporate Card</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Payment Date *
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="input w-full text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Reference / UTR / Cheque #
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. UTR123456789, Cheque #004521"
              className="input w-full text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Notes / Narration
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional remarks about this payment..."
              className="input w-full text-sm resize-none"
            />
          </div>
        </div>

        {/* Open Invoices for Allocation */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Recent Purchase Invoices ({openInvoices.length})
            </h3>
            <span className="text-xs text-muted-foreground">Optional bill link</span>
          </div>

          <p className="text-xs text-muted-foreground">
            Select a specific purchase invoice to automatically set the payment amount or link the remittance.
          </p>

          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
            {openInvoices.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No recent purchase invoices found for this vendor.
              </p>
            ) : (
              openInvoices.map((inv) => (
                <div
                  key={inv.id}
                  onClick={() => handleSelectInvoice(inv)}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors text-xs ${
                    selectedInvoiceId === inv.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/30"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-semibold text-foreground num">{inv.purchaseNo}</span>
                      <span className="text-muted-foreground block text-[11px]">
                        Supplier Inv: {inv.supplierInvoiceNo || "N/A"} [{inv.invoiceDate}]
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-foreground num block">
                        {formatINR(inv.netBillAmount)}
                      </span>
                      {inv.returnedAmount && inv.returnedAmount > 0 ? (
                        <span className="text-[10.5px] text-amber-600 block">
                          Ret: -{formatINR(inv.returnedAmount)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
