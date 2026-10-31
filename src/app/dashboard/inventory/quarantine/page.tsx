import React from "react";
import Link from "next/link";
import {
  getQuarantinedBatchesAction,
  getNearExpiryBatchesForQuarantineAction,
  getExpiryClaimsAction,
} from "@/app/actions/quarantine";
import { QuarantineClient } from "./QuarantineClient";
import { ArrowLeft, ShieldAlert } from "lucide-react";

export const metadata = {
  title: "Expiry Claim & Quarantine Dump Stock | MediFlow",
  description:
    "Isolate unsaleable expired/damaged medicines from POS, group by supplying distributor, issue formal debit claims, and track settlements.",
};

export default async function QuarantinePage() {
  const [quarantined, nearExpiry, claims] = await Promise.all([
    getQuarantinedBatchesAction(),
    getNearExpiryBatchesForQuarantineAction(),
    getExpiryClaimsAction(),
  ]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/inventory"
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Inventory Hub
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-600 dark:text-rose-400" />
            Expiry Claim & Quarantine Dump Stock
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Isolate unsaleable medicines from POS counter billing, generate distributor Debit Notes
            (DN/EXP/...), and track credit note or replacement reconciliations.
          </p>
        </div>
      </div>

      <QuarantineClient
        initialQuarantined={quarantined}
        initialNearExpiry={nearExpiry}
        initialClaims={claims}
      />
    </div>
  );
}

