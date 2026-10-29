"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import {
  createPurchaseReturnAction,
  getPurchaseForReturn,
} from "@/app/actions/purchase-returns";
import {
  RotateCcw,
  Save,
  ArrowLeft,
  AlertCircle,
  Truck,
  CheckCircle2,
  FileText,
} from "lucide-react";

interface ReturnItemState {
  purchaseItemId: string;
  batchId: string;
  medicineName: string;
  batchNo: string;
  expiryDate: string;
  rate: number;
  discountBp: number;
  gstRateBp: number;
  receivedQty: number;
  alreadyReturnedQty: number;
  currentBatchStock: number;
  maxReturnable: number;
  returnQty: number;
}

interface PurchaseOption {
  id: string;
  purchaseNo: string;
  supplierInvoiceNo: string | null;
  invoiceDate: string;
  supplierName: string;
}

type InitialPurchaseData = NonNullable<Awaited<ReturnType<typeof getPurchaseForReturn>>>;

interface NewReturnClientProps {
  initialPurchases: PurchaseOption[];
  preselectedPurchaseId?: string | null;
  initialPurchaseData?: InitialPurchaseData | null;
}

export function NewReturnClient({
  initialPurchases,
  preselectedPurchaseId,
  initialPurchaseData,
}: NewReturnClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string>(
    preselectedPurchaseId || (initialPurchaseData?.purchase?.id ?? "")
  );

  const [purchaseHeader, setPurchaseHeader] = useState<{
    purchaseNo: string;
    supplierName: string;
    supplierInvoiceNo: string | null;
    invoiceDate: string;
    isInterState: boolean;
  } | null>(
    initialPurchaseData
      ? {
          purchaseNo: initialPurchaseData.purchase.purchaseNo,
          supplierName: initialPurchaseData.supplier.name,
          supplierInvoiceNo: initialPurchaseData.purchase.supplierInvoiceNo,
          invoiceDate: initialPurchaseData.purchase.invoiceDate,
          isInterState: initialPurchaseData.purchase.isInterState,
        }
      : null
  );

  const [items, setItems] = useState<ReturnItemState[]>(
    initialPurchaseData
      ? initialPurchaseData.items.map((i) => ({
          purchaseItemId: i.id,
          batchId: i.batchId,
          medicineName: i.medicineName,
          batchNo: i.batchNo,
          expiryDate: i.expiryDate,
          rate: i.rate ?? 0,
          discountBp: i.discountBp ?? 0,
          gstRateBp: i.gstRateBp ?? 0,
          receivedQty: i.qty,
          alreadyReturnedQty: i.returnedQty ?? 0,
          currentBatchStock: i.currentBatchStock ?? 0,
          maxReturnable: i.availableToReturn ?? 0,
          returnQty: 0,
        }))
      : []
  );

  const [reason, setReason] = useState("Expired goods");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingPurchase, setLoadingPurchase] = useState(false);

  async function handlePurchaseChange(purchaseId: string) {
    setSelectedPurchaseId(purchaseId);
    setError(null);
    if (!purchaseId) {
      setPurchaseHeader(null);
      setItems([]);
      return;
    }

    setLoadingPurchase(true);
    try {
      const data = await getPurchaseForReturn(purchaseId);
      if (data) {
        setPurchaseHeader({
          purchaseNo: data.purchase.purchaseNo,
          supplierName: data.supplier.name,
          supplierInvoiceNo: data.purchase.supplierInvoiceNo,
          invoiceDate: data.purchase.invoiceDate,
          isInterState: data.purchase.isInterState,
        });

        setItems(
          data.items.map((i) => ({
            purchaseItemId: i.id,
            batchId: i.batchId,
            medicineName: i.medicineName,
            batchNo: i.batchNo,
            expiryDate: i.expiryDate,
            rate: i.rate ?? 0,
            discountBp: i.discountBp ?? 0,
            gstRateBp: i.gstRateBp ?? 0,
            receivedQty: i.qty,
            alreadyReturnedQty: i.returnedQty ?? 0,
            currentBatchStock: i.currentBatchStock ?? 0,
            maxReturnable: i.availableToReturn ?? 0,
            returnQty: 0,
          }))
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load purchase items");
    } finally {
      setLoadingPurchase(false);
    }
  }

  function updateReturnQty(index: number, qty: number) {
    setItems((prev) => {
      const copy = [...prev];
      const max = copy[index].maxReturnable;
      const sanitized = Math.max(0, Math.min(qty, max));
      copy[index] = { ...copy[index], returnQty: sanitized };
      return copy;
    });
  }

  // Calculate live estimates
  const activeReturnLines = items.filter((i) => i.returnQty > 0);

  let totalTaxable = 0;
  let totalTax = 0;
  let grandTotal = 0;

  for (const line of activeReturnLines) {
    const gross = line.rate * line.returnQty;
    const discount = Math.round((gross * line.discountBp) / 10000);
    const taxable = gross - discount;
    const tax = Math.round((taxable * line.gstRateBp) / 10000);
    totalTaxable += taxable;
    totalTax += tax;
    grandTotal += taxable + tax;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedPurchaseId) {
      setError("Please select a purchase invoice to return against.");
      return;
    }

    if (activeReturnLines.length === 0) {
      setError("Please enter a return quantity greater than 0 for at least one item.");
      return;
    }

    startTransition(async () => {
      const res = await createPurchaseReturnAction({
        purchaseId: selectedPurchaseId,
        reason,
        notes: notes.trim() || undefined,
        items: activeReturnLines.map((i) => ({
          purchaseItemId: i.purchaseItemId,
          batchId: i.batchId,
          qty: i.returnQty,
        })),
      });

      if (!res?.data?.success) {
        setError(res?.serverError || "Failed to create purchase return");
      } else {
        router.push(`/dashboard/purchases/returns/${res.data.returnId}`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PageHeader
        title="Issue Debit Note (Purchase Return)"
        description="Return stock to supplier, deduct batch inventory, and issue GST debit note (B2.3)"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/purchases/returns"
              className="btn btn-secondary inline-flex items-center gap-1.5 text-xs"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Returns
            </Link>
            <button
              type="submit"
              disabled={isPending || activeReturnLines.length === 0}
              className="btn btn-primary inline-flex items-center gap-1.5 text-xs"
            >
              <Save className="h-4 w-4" />
              {isPending ? "Issuing Debit Note..." : "Confirm & Issue Debit Note"}
            </button>
          </div>
        }
      />

      {error && (
        <div className="card border-red-300 bg-red-50 dark:bg-red-950/30 p-4 text-red-800 dark:text-red-200 text-sm flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Error issuing debit note</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Select Purchase */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Step 1: Select Original Purchase Invoice
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Purchase Invoice (GRN) *
            </label>
            <select
              value={selectedPurchaseId}
              onChange={(e) => handlePurchaseChange(e.target.value)}
              className="input w-full text-sm"
              required
            >
              <option value="">-- Choose Purchase GRN --</option>
              {initialPurchases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.purchaseNo} ({p.supplierName}) - Inv #{p.supplierInvoiceNo || "N/A"} [{p.invoiceDate}]
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Reason for Return *
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input w-full text-sm"
              required
            >
              <option value="Expired goods">Expired goods</option>
              <option value="Near-expiry return (60-day vendor policy)">
                Near-expiry return (60-day vendor policy)
              </option>
              <option value="Damaged in transit / broken seal">
                Damaged in transit / broken seal
              </option>
              <option value="Rate difference / billing discrepancy">
                Rate difference / billing discrepancy
              </option>
              <option value="Excess supply / wrong item shipped">
                Excess supply / wrong item shipped
              </option>
              <option value="Batch recall / quality notice">
                Batch recall / quality notice
              </option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        {purchaseHeader && (
          <div className="bg-muted/40 rounded-lg p-3 border text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-muted-foreground block">Supplier:</span>
              <span className="font-semibold text-foreground flex items-center gap-1 mt-0.5">
                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                {purchaseHeader.supplierName}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Supplier Inv #:</span>
              <span className="font-semibold text-foreground mt-0.5 block num">
                {purchaseHeader.supplierInvoiceNo || "N/A"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">GRN Date:</span>
              <span className="font-semibold text-foreground mt-0.5 block">
                {purchaseHeader.invoiceDate}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block">Tax Regime:</span>
              <span className="font-semibold text-foreground mt-0.5 block">
                {purchaseHeader.isInterState ? "Inter-State (IGST)" : "Intra-State (CGST + SGST)"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Return Items Selection */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b bg-muted/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Step 2: Enter Return Quantities
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Only batches with remaining stock on hand can be returned.
            </p>
          </div>
          {activeReturnLines.length > 0 && (
            <span className="badge bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs">
              {activeReturnLines.length} item(s) returning
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Medicine & Batch</th>
                <th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3 text-right">Unit Rate</th>
                <th className="px-4 py-3 text-center">GST %</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3 text-right">Prev Returned</th>
                <th className="px-4 py-3 text-right">In Stock</th>
                <th className="px-4 py-3 text-right">Max Returnable</th>
                <th className="px-4 py-3 text-right w-36">Return Qty</th>
                <th className="px-4 py-3 text-right">Line Debit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingPurchase ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    Loading purchase items...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground text-xs">
                    Select a purchase invoice above to display eligible items.
                  </td>
                </tr>
              ) : (
                items.map((item, idx) => {
                  const gross = item.rate * item.returnQty;
                  const discount = Math.round((gross * item.discountBp) / 10000);
                  const taxable = gross - discount;
                  const tax = Math.round((taxable * item.gstRateBp) / 10000);
                  const lineTotal = taxable + tax;

                  return (
                    <tr
                      key={item.purchaseItemId}
                      className={item.returnQty > 0 ? "bg-primary/5" : undefined}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{item.medicineName}</div>
                        <span className="text-xs text-muted-foreground num font-mono">
                          Batch: {item.batchNo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {item.expiryDate}
                      </td>
                      <td className="px-4 py-3 text-right num text-xs">
                        {formatINR(item.rate)}
                      </td>
                      <td className="px-4 py-3 text-center num text-xs">
                        {(item.gstRateBp / 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-right num text-xs text-muted-foreground">
                        {item.receivedQty}
                      </td>
                      <td className="px-4 py-3 text-right num text-xs text-muted-foreground">
                        {item.alreadyReturnedQty}
                      </td>
                      <td className="px-4 py-3 text-right num text-xs font-semibold">
                        {item.currentBatchStock}
                      </td>
                      <td className="px-4 py-3 text-right num text-xs font-bold text-blue-600 dark:text-blue-400">
                        {item.maxReturnable}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min="0"
                          max={item.maxReturnable}
                          value={item.returnQty}
                          onChange={(e) =>
                            updateReturnQty(idx, parseInt(e.target.value, 10) || 0)
                          }
                          disabled={item.maxReturnable <= 0}
                          className="input !h-8 text-right num w-24 text-sm font-semibold"
                        />
                      </td>
                      <td className="px-4 py-3 text-right num font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatINR(lineTotal)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Step 3: Remarks and Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 card p-5 space-y-3">
          <label className="text-xs font-medium text-muted-foreground block">
            Additional Debit Note Remarks / Transporter Details
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Courier tracking #, seal damage inspection note, or vendor approval reference..."
            className="input w-full text-sm resize-none"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>
              Submitting automatically reduces physical batch stock and credits the supplier ledger.
            </span>
          </div>
        </div>

        <div className="card p-5 space-y-3 bg-muted/20">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Debit Note Summary
          </h4>
          <div className="space-y-2 text-xs divide-y divide-border pt-1">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Returning Items:</span>
              <span className="font-semibold num">{activeReturnLines.length}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Total Units:</span>
              <span className="font-semibold num">
                {activeReturnLines.reduce((acc, l) => acc + l.returnQty, 0)}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Taxable Value:</span>
              <span className="font-semibold num">{formatINR(totalTaxable)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">GST Reversal:</span>
              <span className="font-semibold num text-blue-600 dark:text-blue-400">
                {formatINR(totalTax)}
              </span>
            </div>
            <div className="flex justify-between py-2 text-sm font-bold border-t">
              <span className="text-foreground">Total Debit Note:</span>
              <span className="text-emerald-600 dark:text-emerald-400 num">
                {formatINR(grandTotal)}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || activeReturnLines.length === 0}
            className="btn btn-primary w-full text-xs py-2.5 mt-2"
          >
            {isPending ? "Issuing..." : "Confirm & Issue Debit Note"}
          </button>
        </div>
      </div>
    </form>
  );
}
