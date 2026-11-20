"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft, FileText, PackageCheck, Printer, Truck } from "lucide-react";
import type { getTransferById } from "@/server/domain/inventory/transfers";
import {
  dispatchTransferAction,
  receiveTransferAction,
  cancelTransferAction,
} from "@/app/actions/transfers";
import { DispatchModal } from "./_components/DispatchModal";
import { ReceiveModal } from "./_components/ReceiveModal";
import { TransferStepper } from "./_components/TransferStepper";
import { StatutoryCard } from "./_components/StatutoryCard";
import { TransferItemsTable } from "./_components/TransferItemsTable";

type TransferData = Awaited<ReturnType<typeof getTransferById>>;

interface TransferDetailProps {
  transfer: TransferData;
  userStoreId?: string;
  canDispatch: boolean;
  canReceive: boolean;
}

export function TransferDetailClient({
  transfer,
  canDispatch,
  canReceive,
}: TransferDetailProps) {
  const router = useRouter();
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDispatch = async (data: {
    transportMode: "road" | "rail" | "air";
    vehicleNo?: string;
    transporterName?: string;
    transporterId?: string;
    eWayBillNo?: string;
  }) => {
    setActionError(null);
    setIsSubmitting(true);
    const res = await dispatchTransferAction({
      transferId: transfer.id,
      transportMode: data.transportMode,
      vehicleNo: data.vehicleNo,
      transporterName: data.transporterName,
      transporterId: data.transporterId,
      eWayBillNo: data.eWayBillNo,
      idempotencyKey: crypto.randomUUID(),
    });
    setIsSubmitting(false);

    if (res.success) {
      setIsDispatchModalOpen(false);
      router.refresh();
    } else {
      setIsDispatchModalOpen(false);
      setActionError(res.error ?? "Failed to dispatch transfer");
    }
  };

  const handleReceive = async (data: {
    items: {
      itemId: string;
      qtyReceived: number;
      qtyDamaged: number;
      qtyShortage: number;
      discrepancyReason?: string;
    }[];
    notes?: string;
    idempotencyKey: string;
  }) => {
    setActionError(null);
    setIsSubmitting(true);
    const res = await receiveTransferAction({
      transferId: transfer.id,
      items: data.items,
      notes: data.notes,
      idempotencyKey: data.idempotencyKey,
    });
    setIsSubmitting(false);

    if (res.success) {
      setIsReceiveModalOpen(false);
      router.refresh();
    } else {
      setIsReceiveModalOpen(false);
      setActionError(res.error ?? "Failed to receive transfer");
    }
  };

  const handleCancel = async () => {
    const reason = prompt("Enter cancellation reason:");
    if (!reason?.trim()) return;

    setActionError(null);
    setIsSubmitting(true);
    const res = await cancelTransferAction({
      transferId: transfer.id,
      reason: reason.trim(),
    });
    setIsSubmitting(false);

    if (res.success) {
      router.refresh();
    } else {
      setActionError(res.error ?? "Failed to cancel transfer");
    }
  };

  const isEWayBillRequired = (transfer.totalValuePaise ?? 0) > 50_000_00;
  const isDraft = transfer.status === "draft";
  const isInTransit = transfer.status === "dispatched" || transfer.status === "partially_received";

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Top Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/inventory/transfers"
            className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-ink-900">{transfer.transferNo}</h1>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  transfer.docKind === "tax_invoice"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                }`}
              >
                <FileText className="h-3 w-3" />
                {transfer.docKind === "tax_invoice" ? "Rule 46 Invoice" : "Rule 55 Challan"}
              </span>
            </div>
            <p className="text-xs text-ink-500">
              Created on {format(new Date(transfer.createdAt), "dd MMM yyyy, hh:mm a")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/inventory/transfers/${transfer.id}/print`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print Challan
          </Link>

          {isDraft && canDispatch && (
            <>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSubmitting}
                className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                Cancel Draft
              </button>
              <button
                type="button"
                onClick={() => setIsDispatchModalOpen(true)}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-500 transition-colors"
              >
                <Truck className="h-4 w-4" />
                Dispatch Transfer
              </button>
            </>
          )}

          {isInTransit && canReceive && (
            <button
              type="button"
              onClick={() => setIsReceiveModalOpen(true)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 transition-colors"
            >
              <PackageCheck className="h-4 w-4" />
              Receive Stock
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">
          {actionError}
        </div>
      )}

      <TransferStepper
        status={transfer.status}
        fromStoreName={transfer.fromStore?.name}
        toStoreName={transfer.toStore?.name}
        dispatchedAt={transfer.dispatchedAt}
        receivedAt={transfer.receivedAt}
        vehicleNo={transfer.vehicleNo}
      />

      <StatutoryCard
        docKind={transfer.docKind}
        documentNo={transfer.documentNo}
        fromStoreGstin={transfer.fromStore?.gstin}
        toStoreGstin={transfer.toStore?.gstin}
        vehicleNo={transfer.vehicleNo}
        eWayBillNo={transfer.eWayBillNo}
        transporterName={transfer.transporterName}
        transportMode={transfer.transportMode}
        isEWayBillRequired={isEWayBillRequired}
      />

      <TransferItemsTable
        items={transfer.items ?? []}
        totalValuePaise={transfer.totalValuePaise ?? 0}
      />

      <DispatchModal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        onConfirm={handleDispatch}
        isSubmitting={isSubmitting}
        totalValuePaise={transfer.totalValuePaise ?? 0}
      />

      <ReceiveModal
        isOpen={isReceiveModalOpen}
        onClose={() => setIsReceiveModalOpen(false)}
        onConfirm={handleReceive}
        isSubmitting={isSubmitting}
        items={transfer.items ?? []}
      />
    </div>
  );
}
