import React from "react";
import Link from "next/link";
import { getStoreRacksAction } from "@/app/actions/stocktake";
import { NewAuditSessionClient } from "./NewAuditSessionClient";
import { ArrowLeft, ClipboardCheck } from "lucide-react";

export const metadata = {
  title: "New Stock Audit Session | MediFlow",
  description: "Configure and start a physical inventory stocktake session.",
};

export default async function NewStocktakePage() {
  const racks = await getStoreRacksAction();

  return (
    <div className="page space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/inventory/stocktake"
          className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900 transition-colors mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Audit Sessions
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink-900 flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-brand-600" />
          Start Physical Stocktake Session
        </h1>
        <p className="text-xs sm:text-sm text-ink-500 mt-1">
          Snapshot active batches to generate an immutable stock count sheet.
        </p>
      </div>

      <NewAuditSessionClient racks={racks} />
    </div>
  );
}
