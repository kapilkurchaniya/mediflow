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
    <div className="page space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/dashboard/inventory"
              className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-900 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Inventory Hub
            </Link>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-600" />
            Expiry Claim & Quarantine Dump Stock
          </h1>
          <p className="text-xs sm:text-sm text-ink-500 mt-1 max-w-2xl">
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
