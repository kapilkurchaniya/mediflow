"use client";

import React from "react";
import { formatINR } from "@/lib/format";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type {
  ExpiryClaimItem,
  NearExpiryBatch,
  QuarantinedItem,
} from "./_components/types";
import { useQuarantineState } from "./_components/useQuarantineState";
import { QuarantinedStockTab } from "./_components/QuarantinedStockTab";
import { DistributorClaimsTab } from "./_components/DistributorClaimsTab";
import { NearExpiryStockTab } from "./_components/NearExpiryStockTab";
import { QuarantineModals } from "./_components/QuarantineModals";

interface Props {
  initialQuarantined: QuarantinedItem[];
  initialNearExpiry: NearExpiryBatch[];
  initialClaims: ExpiryClaimItem[];
}

export function QuarantineClient({
  initialQuarantined,
  initialNearExpiry,
  initialClaims,
}: Props) {
  const state = useQuarantineState({
    initialQuarantined,
    initialNearExpiry,
    initialClaims,
  });

  return (
    <div className="space-y-6">
      {state.notification && (
        <div
          role="alert"
          aria-live="polite"
          className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${
            state.notification.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          {state.notification.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          )}
          <div className="flex-1 text-sm font-medium">{state.notification.text}</div>
          <button
            onClick={() => state.setNotification(null)}
            className="text-xs opacity-60 hover:opacity-100 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between text-ink-500 mb-2">
            <span className="eyebrow">Quarantined Stock Value</span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
              <ShieldAlert className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-ink-900 num">
            {formatINR(state.totalQuarantinedValPaise)}
          </div>
          <div className="mt-1 text-xs text-rose-600 font-medium">
            {state.filteredQuarantined.length} unclaimed batches isolated from POS
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-ink-500 mb-2">
            <span className="eyebrow">Claims Pending Settlement</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 num">
            {formatINR(state.totalClaimedPendingPaise)}
          </div>
          <div className="mt-1 text-xs text-ink-500">
            Debited to distributors; awaiting credit note/stock
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-ink-500 mb-2">
            <span className="eyebrow">Settled & Recovered Value</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 num">
            {formatINR(state.totalSettledPaise)}
          </div>
          <div className="mt-1 text-xs text-ink-500">
            Resolved via credit notes or replacement batches
          </div>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-2 border-b border-ink-150 pb-2">
        <button
          onClick={() => state.setActiveTab("quarantined")}
          className={`btn btn-sm ${
            state.activeTab === "quarantined"
              ? "btn-primary shadow-xs"
              : "btn-ghost"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Quarantined Dump Stock ({state.filteredQuarantined.length})
        </button>

        <button
          onClick={() => state.setActiveTab("claims")}
          className={`btn btn-sm ${
            state.activeTab === "claims"
              ? "btn-primary shadow-xs"
              : "btn-ghost"
          }`}
        >
          <FileText className="w-4 h-4" />
          Distributor Debit Claims ({state.claims.length})
        </button>

        <button
          onClick={() => state.setActiveTab("near_expiry")}
          className={`btn btn-sm ${
            state.activeTab === "near_expiry"
              ? "btn-primary shadow-xs"
              : "btn-ghost"
          }`}
        >
          <AlertOctagon className="w-4 h-4" />
          Near-Expiry / Expired Inventory ({state.nearExpiry.length})
        </button>
      </div>

      {/* Active Tab Views */}
      {state.activeTab === "quarantined" && (
        <QuarantinedStockTab
          filteredQuarantined={state.filteredQuarantined}
          searchQuery={state.searchQuery}
          setSearchQuery={state.setSearchQuery}
          selectedSupplierFilter={state.selectedSupplierFilter}
          setSelectedSupplierFilter={state.setSelectedSupplierFilter}
          suppliersList={state.suppliersList}
          selectedQuarantineIds={state.selectedQuarantineIds}
          setSelectedQuarantineIds={state.setSelectedQuarantineIds}
          handleGenerateSupplierClaim={state.handleGenerateSupplierClaim}
          isSubmitting={state.isSubmitting}
        />
      )}

      {state.activeTab === "claims" && (
        <DistributorClaimsTab
          claims={state.claims}
          onOpenSettleModal={(claim) => {
            state.setSettleModalClaim(claim);
            state.setSettlementType("credit_note");
            state.setCreditNoteNo("");
            state.setSettleNotes("");
          }}
        />
      )}

      {state.activeTab === "near_expiry" && (
        <NearExpiryStockTab
          nearExpiry={state.nearExpiry}
          onOpenQuarantine={state.handleOpenQuarantine}
        />
      )}

      {/* Modals */}
      <QuarantineModals
        quarantineModalBatch={state.quarantineModalBatch}
        onCloseQuarantineModal={() => state.setQuarantineModalBatch(null)}
        quarantineQty={state.quarantineQty}
        setQuarantineQty={state.setQuarantineQty}
        quarantineReason={state.quarantineReason}
        setQuarantineReason={state.setQuarantineReason}
        quarantineNotes={state.quarantineNotes}
        setQuarantineNotes={state.setQuarantineNotes}
        onConfirmQuarantine={state.handleConfirmQuarantine}

        settleModalClaim={state.settleModalClaim}
        onCloseSettleModal={() => state.setSettleModalClaim(null)}
        settlementType={state.settlementType}
        setSettlementType={state.setSettlementType}
        creditNoteNo={state.creditNoteNo}
        setCreditNoteNo={state.setCreditNoteNo}
        settleNotes={state.settleNotes}
        setSettleNotes={state.setSettleNotes}
        onConfirmSettle={state.handleConfirmSettle}

        isSubmitting={state.isSubmitting}
      />
    </div>
  );
}
