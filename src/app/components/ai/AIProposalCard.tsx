"use client";

import { useState } from "react";
import { Check, X, Loader2, ShoppingBag, ArrowRightLeft, PlusCircle, ExternalLink } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { confirmAiAction, cancelAiAction } from "@/app/actions/ai";
import type { ToolProposal } from "@/server/ai/types";

interface ConfirmedActionData {
  poId?: string;
  poNo?: string;
  transferId?: string;
  transferNo?: string;
  medicineId?: string;
  medicineName?: string;
}

interface AIProposalCardProps {
  proposal: ToolProposal<Record<string, unknown>>;
}

export function AIProposalCard({ proposal }: AIProposalCardProps) {
  const [status, setStatus] = useState<string>(proposal.status);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmedData, setConfirmedData] = useState<ConfirmedActionData | null>(null);

  const isPending = status === "pending_confirmation";
  const isConfirmed = status === "confirmed";
  const isCancelled = status === "cancelled";

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await confirmAiAction(proposal.actionId);
      if (res.success) {
        setStatus("confirmed");
        setFeedback(res.message);
        if (res.data) setConfirmedData(res.data as ConfirmedActionData);
      } else {
        setFeedback(res.error || "Failed to confirm action.");
      }
    } catch (e: unknown) {
      setFeedback(e instanceof Error ? e.message : "Confirmation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await cancelAiAction(proposal.actionId);
      if (res.success) {
        setStatus("cancelled");
        setFeedback("Proposal was cancelled.");
      } else {
        setFeedback(res.error || "Failed to cancel proposal.");
      }
    } catch (e: unknown) {
      setFeedback(e instanceof Error ? e.message : "Cancellation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getIntentBadge = () => {
    switch (proposal.intent) {
      case "draft_purchase_order":
        return {
          icon: ShoppingBag,
          label: "Draft Purchase Order",
          color: "bg-blue-50 text-blue-700 border-blue-200",
        };
      case "expiry_redistribution":
        return {
          icon: ArrowRightLeft,
          label: "Inter-Branch Transfer",
          color: "bg-purple-50 text-purple-700 border-purple-200",
        };
      case "add_medicine":
      default:
        return {
          icon: PlusCircle,
          label: "New Medicine",
          color: "bg-brand-50 text-brand-700 border-brand-200",
        };
    }
  };

  const badge = getIntentBadge();
  const Icon = badge.icon;

  return (
    <div
      className={clsx(
        "my-2.5 rounded-xl border p-3.5 shadow-xs transition-all duration-200",
        isPending && "border-amber-200 bg-amber-50/30 ring-1 ring-amber-100",
        isConfirmed && "border-emerald-200 bg-emerald-50/20 ring-1 ring-emerald-100",
        isCancelled && "border-ink-150 bg-ink-50/40 opacity-75"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-100/60 pb-2 mb-2.5">
        <div className="flex items-center gap-1.5">
          <span className={clsx("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium border", badge.color)}>
            <Icon className="h-3 w-3" />
            {badge.label}
          </span>
        </div>

        <span
          className={clsx(
            "rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            isPending && "bg-amber-100 text-amber-800",
            isConfirmed && "bg-emerald-100 text-emerald-800",
            isCancelled && "bg-ink-100 text-ink-600"
          )}
        >
          {isPending ? "Human Approval Required" : status}
        </span>
      </div>

      {/* Summary */}
      <p className="text-[12.5px] font-medium text-ink-900 leading-snug mb-2">{String(proposal.summary || "")}</p>

      {/* Itemized Detail Previews */}
      {proposal.intent === "draft_purchase_order" && Boolean(proposal.payload?.items) && (
        (() => {
          const items = (proposal.payload?.items as Array<Record<string, unknown>>) || [];
          return (
            <div className="my-2 rounded-lg border border-ink-100 bg-white overflow-hidden text-[11.5px]">
              <div className="grid grid-cols-3 bg-ink-50 px-2.5 py-1 text-ink-500 font-semibold text-[10.5px]">
                <span>Medicine</span>
                <span className="text-right">Qty (Packs)</span>
                <span className="text-right">Est. Cost</span>
              </div>
              <div className="max-h-28 overflow-y-auto divide-y divide-ink-100">
                {items.slice(0, 5).map((it, idx: number) => (
                  <div key={idx} className="grid grid-cols-3 px-2.5 py-1 text-ink-800">
                    <span className="truncate font-medium">{String(it.medicineName || "")}</span>
                    <span className="text-right num">{String(it.suggestedPacks || 0)} pk</span>
                    <span className="text-right num">₹{(Number(it.estimatedCostPaise || 0) / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              {items.length > 5 && (
                <div className="px-2.5 py-0.5 bg-ink-50 text-[10.5px] text-ink-400 text-center border-t border-ink-100">
                  +{items.length - 5} more items
                </div>
              )}
            </div>
          );
        })()
      )}

      {proposal.intent === "add_medicine" && Boolean(proposal.payload) && (
        <div className="my-2 grid grid-cols-2 gap-2 text-[11.5px]">
          <div className="rounded-lg bg-white p-2 border border-ink-100">
            <span className="text-[10px] text-ink-400 block uppercase">Name</span>
            <span className="font-semibold text-ink-900">{String(proposal.payload?.name || "")}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-ink-100">
            <span className="text-[10px] text-ink-400 block uppercase">MRP</span>
            <span className="font-semibold text-ink-900">₹{(Number(proposal.payload?.mrpPaise || 0) / 100).toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Feedback banner */}
      {feedback && (
        <div
          className={clsx(
            "my-2 rounded-lg p-2 text-[11.5px] font-medium",
            isConfirmed && "bg-emerald-50 text-emerald-800 border border-emerald-150",
            status === "error" && "bg-red-50 text-red-800 border border-red-150",
            isCancelled && "bg-ink-100 text-ink-700"
          )}
        >
          {feedback}
        </div>
      )}

      {/* Interactive Actions */}
      {isPending && (
        <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-ink-100/50">
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            className="btn btn-ghost btn-xs text-ink-600 hover:text-ink-900 text-[11px] h-7 px-2.5"
          >
            <X className="h-3 w-3 mr-1" />
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="btn btn-brand btn-xs text-[11px] h-7 px-3 inline-flex items-center gap-1 shadow-xs"
          >
            {isSubmitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Confirm & Execute
          </button>
        </div>
      )}

      {/* Post-confirmation links */}
      {isConfirmed && confirmedData && (
        <div className="mt-2 pt-1 text-right">
          {Boolean(confirmedData.poId) && (
            <Link
              href={`/dashboard/purchases/orders/${confirmedData.poId}`}
              className="text-brand-600 text-[11.5px] font-medium hover:underline inline-flex items-center gap-1"
            >
              View Purchase Order <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          {Boolean(confirmedData.transferId) && (
            <Link
              href={`/dashboard/inventory/transfers`}
              className="text-brand-600 text-[11.5px] font-medium hover:underline inline-flex items-center gap-1"
            >
              View Stock Transfers <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          {Boolean(confirmedData.medicineId) && (
            <Link
              href="/dashboard/inventory"
              className="text-brand-600 text-[11.5px] font-medium hover:underline inline-flex items-center gap-1"
            >
              View in Catalogue <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
