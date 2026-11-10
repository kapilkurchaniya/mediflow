"use client";

import { Receipt, ShoppingBag, Layers, ArrowUpRight, AlertTriangle, ShieldCheck } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import type { ToolProposal } from "@/server/ai/types";
import { AIProposalCard } from "./AIProposalCard";

export interface ToolInvocationRecord {
  toolName: string;
  result?: Record<string, unknown> | null;
}

export function AIToolCard({ toolInvocation }: { toolInvocation: ToolInvocationRecord }) {
  const { toolName, result } = toolInvocation;
  if (!result || result.error) return null;

  // 1. Two-phase write action proposals
  if (result.type === "PROPOSAL") {
    return <AIProposalCard proposal={result as unknown as ToolProposal<Record<string, unknown>>} />;
  }

  // 2. Sales Summary Card
  if (toolName === "get_sales_summary") {
    return (
      <div className="my-2 rounded-xl border border-brand-200 bg-brand-50/30 p-3 shadow-xs text-ink-900">
        <div className="flex items-center justify-between border-b border-brand-100 pb-2 mb-2.5">
          <div className="flex items-center gap-1.5 font-semibold text-[13px] text-ink-900">
            <Receipt className="h-4 w-4 text-brand-600" />
            <span>Sales Summary</span>
          </div>
          <span className="badge badge-brand !text-[10px] capitalize font-medium">{String(result.period || "Report")}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-lg bg-white p-2 border border-brand-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Total Revenue</span>
            <span className="text-[15px] font-bold text-brand-700">{String(result.total_revenue_display || "₹0.00")}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-brand-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Invoices Raised</span>
            <span className="text-[15px] font-bold text-ink-900">{Number(result.total_invoices ?? 0)}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-brand-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Avg Order Value</span>
            <span className="text-[12.5px] font-semibold text-ink-800">{String(result.average_order_value_display || "₹0.00")}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-brand-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Credit Due</span>
            <span className="text-[12.5px] font-semibold text-ink-800">{String(result.total_credit_display || "₹0.00")}</span>
          </div>
        </div>

        <div className="mt-2.5 pt-2 border-t border-brand-100/60 flex items-center justify-between text-[11px]">
          <span className="text-ink-400">Period: {String(result.date_range || "")}</span>
          <Link href="/dashboard/sales" className="text-brand-600 font-medium hover:underline inline-flex items-center gap-0.5">
            View bills <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    );
  }

  // 3. Purchase Summary Card
  if (toolName === "get_purchase_summary") {
    return (
      <div className="my-2 rounded-xl border border-blue-200 bg-blue-50/30 p-3 shadow-xs text-ink-900">
        <div className="flex items-center justify-between border-b border-blue-100 pb-2 mb-2.5">
          <div className="flex items-center gap-1.5 font-semibold text-[13px] text-ink-900">
            <ShoppingBag className="h-4 w-4 text-blue-600" />
            <span>Purchase Summary</span>
          </div>
          <span className="badge badge-neutral !text-[10px] capitalize font-medium">{String(result.period || "Report")}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-lg bg-white p-2 border border-blue-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Total Purchases</span>
            <span className="text-[15px] font-bold text-blue-700">{String(result.total_purchases_display || "₹0.00")}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-blue-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Invoices</span>
            <span className="text-[15px] font-bold text-ink-900">{Number(result.total_invoices ?? 0)}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-blue-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Amount Paid</span>
            <span className="text-[12.5px] font-semibold text-ink-800">{String(result.total_paid_display || "₹0.00")}</span>
          </div>
          <div className="rounded-lg bg-white p-2 border border-blue-100/80 shadow-2xs">
            <span className="text-[10.5px] text-ink-500 block">Outstanding</span>
            <span className="text-[12.5px] font-semibold text-ink-800">{String(result.outstanding_display || "₹0.00")}</span>
          </div>
        </div>

        <div className="mt-2.5 pt-2 border-t border-blue-100/60 flex items-center justify-between text-[11px]">
          <span className="text-ink-400">Period: {String(result.date_range || "")}</span>
          <Link href="/dashboard/purchases" className="text-blue-600 font-medium hover:underline inline-flex items-center gap-0.5">
            View GRNs <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    );
  }

  // 4. Stock Details Card
  if (toolName === "get_stock_details" && Array.isArray(result.medicines)) {
    return (
      <div className="my-2 space-y-2">
        {(result.medicines as Array<Record<string, unknown>>).map((med, idx: number) => {
          const isOut = med.stock_status === "OUT_OF_STOCK";
          const isLow = med.stock_status === "LOW_STOCK";
          const activeBatches = (med.active_batches as Array<Record<string, unknown>>) || [];
          return (
            <div key={idx} className="rounded-xl border border-ink-150 bg-white p-3 shadow-xs text-ink-900">
              <div className="flex items-start justify-between gap-2 border-b border-ink-100 pb-2 mb-2">
                <div>
                  <h4 className="font-semibold text-[13px] text-ink-900 leading-tight">{String(med.name || "")}</h4>
                  <p className="text-[11px] text-ink-500">{String(med.generic_composition || "")} · {String(med.pack_size || "")}</p>
                </div>
                <span
                  className={clsx(
                    "badge !text-[10px] shrink-0",
                    isOut ? "badge-danger" : isLow ? "badge-warning" : "badge-success"
                  )}
                >
                  {isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}
                </span>
              </div>

              <div className="flex items-center justify-between mb-2 text-[12px]">
                <span className="text-ink-600">Available Stock:</span>
                <span className="font-bold text-[14px] text-ink-900 num">{Number(med.total_stock_units || 0)} units</span>
              </div>

              {activeBatches.length > 0 && (
                <div className="rounded-lg border border-ink-100 overflow-hidden text-[11px] bg-ink-50/40">
                  <div className="grid grid-cols-4 bg-ink-100/70 px-2 py-1 font-semibold text-ink-600">
                    <span>Batch</span>
                    <span>Expiry</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">MRP</span>
                  </div>
                  {activeBatches.map((b, bIdx: number) => (
                    <div key={bIdx} className="grid grid-cols-4 px-2 py-1 border-t border-ink-100 text-ink-700">
                      <span className="font-mono font-medium">{String(b.batch_no || "")}</span>
                      <span>{String(b.expiry_date || "")}</span>
                      <span className="text-right font-semibold">{Number(b.qty_on_hand || 0)}</span>
                      <span className="text-right">{String(b.mrp_display || "")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // 5. GSTR-2B Mismatch Explainer Card
  if (toolName === "explain_gst_mismatch" && Array.isArray(result.explanations)) {
    return (
      <div className="my-2 rounded-xl border border-amber-200 bg-amber-50/20 p-3 shadow-xs">
        <div className="flex items-center justify-between border-b border-amber-100 pb-2 mb-2.5">
          <div className="flex items-center gap-1.5 font-semibold text-[13px] text-ink-900">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <span>GSTR-2B Statutory Discrepancies</span>
          </div>
          <span className="badge badge-warning !text-[10px] font-medium">{result.explanations.length} Items</span>
        </div>

        <div className="space-y-2.5">
          {(result.explanations as Array<Record<string, unknown>>).map((exp, idx: number) => (
            <div key={idx} className="rounded-lg border border-ink-150 bg-white p-2.5 text-[12px] shadow-2xs">
              <div className="flex items-center justify-between font-mono font-medium text-ink-900 border-b border-ink-100 pb-1 mb-1.5">
                <span>Inv: {String(exp.invoiceNo || "")}</span>
                <span className="text-[11px] text-ink-500 font-sans">{String(exp.supplierGstin || "")}</span>
              </div>
              <p className="text-[11.5px] text-ink-700 mb-1.5 leading-snug">{String(exp.explanation || "")}</p>
              <div className="rounded bg-brand-50/50 p-1.5 border border-brand-100 text-[11px] text-brand-900 flex items-start gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-brand-600 shrink-0 mt-0.5" />
                <span><strong>Recommended Action:</strong> {String(exp.recommendedAction || "")}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
