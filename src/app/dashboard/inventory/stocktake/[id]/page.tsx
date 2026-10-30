import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStockAuditSessionAction } from "@/app/actions/stocktake";
import { StocktakeSessionClient } from "./StocktakeSessionClient";
import { ArrowLeft, ClipboardCheck } from "lucide-react";

export const metadata = {
  title: "Stock Audit Session Details | MediFlow",
  description: "Record physical counts and review discrepancies.",
};

export default async function StocktakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getStockAuditSessionAction(id);

  if (!data) {
    notFound();
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/inventory/stocktake"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Stocktake Sessions
        </Link>
      </div>

      <StocktakeSessionClient
        initialSession={data.session}
        initialItems={data.items}
        initialSummary={data.summary}
      />
    </div>
  );
}

