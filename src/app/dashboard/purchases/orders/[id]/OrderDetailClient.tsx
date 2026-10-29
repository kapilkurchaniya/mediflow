"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Printer,
  CheckCircle2,
  Send,
  Ban,
  PackageCheck,
  Building2,
  Calendar,
  User,
  Loader2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { format } from "date-fns";
import { formatINR } from "@/lib/format";
import type { PurchaseOrderDetail } from "@/server/domain/purchasing/purchase-orders";
import {
  approvePurchaseOrderAction,
  markPurchaseOrderSentAction,
  cancelPurchaseOrderAction,
} from "@/app/actions/purchase-orders";

export function OrderDetailClient({ po }: { po: PurchaseOrderDetail }) {
  const router = useRouter();

  const [isApproving, setIsApproving] = useState(false);
  const [isMarkingSent, setIsMarkingSent] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleApprove = async () => {
    setErrorMsg(null);
    setIsApproving(true);
    try {
      const res = await approvePurchaseOrderAction({ poId: po.id });
      if (res?.data?.success) {
        router.refresh();
      } else {
        setErrorMsg(res?.serverError || "Failed to approve purchase order.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error approving order.");
    } finally {
      setIsApproving(false);
    }
  };

  const handleMarkSent = async () => {
    setErrorMsg(null);
    setIsMarkingSent(true);
    try {
      const res = await markPurchaseOrderSentAction({ poId: po.id });
      if (res?.data?.success) {
        router.refresh();
      } else {
        setErrorMsg(res?.serverError || "Failed to mark order as sent.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error marking order as sent.");
    } finally {
      setIsMarkingSent(false);
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) return;

    setErrorMsg(null);
    setIsCancelling(true);
    try {
      const res = await cancelPurchaseOrderAction({ poId: po.id, reason: cancelReason.trim() });
      if (res?.data?.success) {
        setShowCancelModal(false);
        router.refresh();
      } else {
        setErrorMsg(res?.serverError || "Failed to cancel purchase order.");
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Error cancelling order.");
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <span className="badge bg-ink-100 text-ink-700 font-bold text-xs uppercase tracking-wider">Draft</span>;
      case "approved":
        return <span className="badge bg-blue-100 text-blue-700 font-bold text-xs uppercase tracking-wider">Approved</span>;
      case "sent":
        return <span className="badge bg-indigo-100 text-indigo-700 font-bold text-xs uppercase tracking-wider">Sent to Supplier</span>;
      case "partially_received":
        return <span className="badge bg-amber-100 text-amber-800 font-bold text-xs uppercase tracking-wider">Partially Received</span>;
      case "received":
        return <span className="badge bg-emerald-100 text-emerald-800 font-bold text-xs uppercase tracking-wider">Fully Received</span>;
      case "cancelled":
        return <span className="badge bg-rose-100 text-rose-800 font-bold text-xs uppercase tracking-wider">Cancelled</span>;
      default:
        return <span className="badge text-xs uppercase tracking-wider">{status}</span>;
    }
  };

  const totalOrderedUnits = po.items.reduce((sum, item) => sum + item.qty + item.freeQty, 0);
  const totalReceivedUnits = po.items.reduce((sum, item) => sum + item.receivedQty, 0);
  const fulfillmentPercentage = totalOrderedUnits > 0 ? Math.round((totalReceivedUnits / totalOrderedUnits) * 100) : 0;

  return (
    <div className="page space-y-6">
      {/* Top back button */}
      <div className="flex items-center gap-2 text-sm text-ink-600 mb-2">
        <Link
          href="/dashboard/purchases/orders"
          className="flex items-center gap-1.5 hover:text-brand-700 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Purchase Orders
        </Link>
      </div>

      {errorMsg && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Order Header & Action Bar */}
      <div className="card p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-black text-ink-900 font-mono tracking-tight">{po.poNo}</h1>
            {getStatusBadge(po.status)}
          </div>
          <p className="text-xs text-ink-500">
            Created on {format(new Date(po.createdAt), "dd MMM yyyy, hh:mm a")} by{" "}
            <span className="font-semibold text-ink-800">{po.createdByName || "Staff"}</span>
          </p>
        </div>

        {/* Contextual Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/dashboard/purchases/orders/${po.id}/print`}
            target="_blank"
            className="btn btn-secondary text-xs flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" /> Print PO
          </Link>

          {po.status === "draft" && (
            <>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isApproving}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approve PO
              </button>
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="btn btn-ghost text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-1.5"
              >
                <Ban className="w-3.5 h-3.5" /> Cancel
              </button>
            </>
          )}

          {po.status === "approved" && (
            <>
              <button
                type="button"
                onClick={handleMarkSent}
                disabled={isMarkingSent}
                className="btn btn-secondary text-xs flex items-center gap-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
              >
                {isMarkingSent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Mark as Sent
              </button>
              <Link
                href={`/dashboard/purchases/new?poId=${po.id}`}
                className="btn btn-primary text-xs flex items-center gap-1.5"
              >
                <PackageCheck className="w-3.5 h-3.5" /> Receive GRN
              </Link>
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="btn btn-ghost text-xs text-rose-600 hover:bg-rose-50"
              >
                Cancel
              </button>
            </>
          )}

          {(po.status === "sent" || po.status === "partially_received") && (
            <Link
              href={`/dashboard/purchases/new?poId=${po.id}`}
              className="btn btn-primary text-xs flex items-center gap-1.5"
            >
              <PackageCheck className="w-3.5 h-3.5" /> Receive GRN
            </Link>
          )}
        </div>
      </div>

      {/* Information Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        {/* Card 1: Supplier Details */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2 font-bold text-ink-900 border-b border-ink-150 pb-2">
            <Building2 className="w-4 h-4 text-brand-600" /> Supplier Information
          </div>
          <div className="space-y-1.5 text-ink-700">
            <div className="text-sm font-bold text-ink-900">{po.supplierName}</div>
            {po.supplierGstin && (
              <div>
                GSTIN: <span className="font-mono font-semibold">{po.supplierGstin}</span>
              </div>
            )}
            {po.supplierPhone && (
              <div>
                Phone: <span className="font-mono">{po.supplierPhone}</span>
              </div>
            )}
            {po.supplierEmail && <div>Email: {po.supplierEmail}</div>}
            {po.supplierAddress && <div className="text-ink-500">{po.supplierAddress}</div>}
          </div>
        </div>

        {/* Card 2: Schedule & Approval Metadata */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2 font-bold text-ink-900 border-b border-ink-150 pb-2">
            <Calendar className="w-4 h-4 text-brand-600" /> Delivery & Approval
          </div>
          <div className="space-y-1.5 text-ink-700">
            <div>
              Expected Delivery:{" "}
              <span className="font-bold text-ink-900">
                {po.expectedDate ? format(new Date(po.expectedDate), "dd MMM yyyy") : "Not specified"}
              </span>
            </div>
            {po.approvedByName && (
              <div>
                Approved By: <span className="font-semibold text-ink-900">{po.approvedByName}</span>
                {po.approvedAt && (
                  <span className="text-ink-500 block text-[11px]">
                    on {format(new Date(po.approvedAt), "dd MMM yyyy, hh:mm a")}
                  </span>
                )}
              </div>
            )}
            <div>
              Fulfillment Status:{" "}
              <span className="font-semibold text-ink-900">
                {totalReceivedUnits} of {totalOrderedUnits} units received ({fulfillmentPercentage}%)
              </span>
            </div>
            <div className="w-full bg-ink-200 h-2 rounded-full overflow-hidden mt-1">
              <div
                className="bg-brand-600 h-full transition-all duration-300"
                style={{ width: `${fulfillmentPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Notes & Memo */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2 font-bold text-ink-900 border-b border-ink-150 pb-2">
            <Clock className="w-4 h-4 text-brand-600" /> Notes & Instructions
          </div>
          <p className="text-ink-600 text-xs italic leading-relaxed">
            {po.notes || "No special instructions provided for this purchase order."}
          </p>
        </div>
      </div>

      {/* Items Table Card */}
      <div className="card p-5 space-y-4">
        <h3 className="text-sm font-bold text-ink-900">Ordered Items ({po.items.length})</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-ink-700 font-bold">
                <th className="py-2.5 px-3 w-10 text-center">#</th>
                <th className="py-2.5 px-3">Item Description</th>
                <th className="py-2.5 px-3 font-mono text-center">HSN</th>
                <th className="py-2.5 px-3 text-center">Pack</th>
                <th className="py-2.5 px-3 text-center">Ordered Qty</th>
                <th className="py-2.5 px-3 text-center">Free Qty</th>
                <th className="py-2.5 px-3 text-center">Received Qty</th>
                <th className="py-2.5 px-3 text-right">Est. Unit Rate</th>
                <th className="py-2.5 px-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              {po.items.map((item, idx) => {
                const lineTotalPaise = item.qty * item.rate;

                return (
                  <tr key={item.id} className="hover:bg-ink-50/50">
                    <td className="py-2.5 px-3 text-center text-ink-400 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-ink-900">{item.medicineName}</div>
                      {item.genericName && (
                        <div className="text-[11px] text-ink-500 italic">{item.genericName}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-ink-600">
                      {item.hsnCode || "3004"}
                    </td>
                    <td className="py-2.5 px-3 text-center text-ink-600">{item.packSize || "—"}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-ink-900 num">{item.qty}</td>
                    <td className="py-2.5 px-3 text-center text-ink-600 num">{item.freeQty}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`font-mono font-bold ${
                          item.receivedQty >= item.qty
                            ? "text-emerald-700"
                            : item.receivedQty > 0
                            ? "text-amber-700"
                            : "text-ink-400"
                        }`}
                      >
                        {item.receivedQty}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-ink-700">
                      {formatINR(item.rate)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-ink-900">
                      {formatINR(lineTotalPaise)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Order Totals Bar */}
        <div className="flex justify-end pt-3 border-t border-ink-200">
          <div className="w-full md:w-80 bg-ink-50 p-4 rounded-xl border border-ink-150 space-y-2 text-xs">
            <div className="flex justify-between text-ink-600">
              <span>Total Lines</span>
              <span className="font-semibold text-ink-900 num">{po.items.length}</span>
            </div>
            <div className="flex justify-between text-ink-600">
              <span>Total Units</span>
              <span className="font-semibold text-ink-900 num">{totalOrderedUnits}</span>
            </div>
            <div className="pt-2 border-t border-ink-200 flex justify-between items-baseline">
              <span className="text-sm font-bold text-ink-900">Estimated Total</span>
              <span className="text-lg font-black text-brand-700 font-mono">
                {formatINR(po.estimatedTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Order Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="card max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
              <Ban className="w-4 h-4" /> Cancel Purchase Order ({po.poNo})
            </div>
            <p className="text-xs text-ink-600 leading-relaxed">
              Are you sure you want to cancel this purchase order? Any promised customer orders linked to this PO will be reverted to pending status.
            </p>

            <form onSubmit={handleCancel} className="space-y-4">
              <div>
                <label htmlFor="cancel-reason" className="block text-xs font-semibold text-ink-700 mb-1">
                  Cancellation Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Supplier out of stock / pricing mismatch"
                  required
                  rows={3}
                  className="w-full p-2 text-xs rounded-lg border border-ink-200 bg-white text-ink-900 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="btn btn-secondary text-xs"
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  disabled={isCancelling || !cancelReason.trim()}
                  className="btn btn-primary bg-rose-600 hover:bg-rose-700 border-rose-600 text-xs flex items-center gap-1.5"
                >
                  {isCancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Confirm Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

