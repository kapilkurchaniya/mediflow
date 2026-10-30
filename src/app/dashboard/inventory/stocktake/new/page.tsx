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
    <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/inventory/stocktake"
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Audit Sessions
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-teal-600 dark:text-teal-400" />
          Start Physical Stocktake Session
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Snapshot active batches to generate an immutable stock count sheet.
        </p>
      </div>

      <NewAuditSessionClient racks={racks} />
    </div>
  );
}

