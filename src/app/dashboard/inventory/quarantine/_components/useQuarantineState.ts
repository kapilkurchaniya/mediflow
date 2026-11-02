"use client";

import { useState } from "react";
import { formatINR } from "@/lib/format";
import {
  quarantineBatchAction,
  createSupplierExpiryClaimAction,
  settleSupplierExpiryClaimAction,
} from "@/app/actions/quarantine";
import type { ExpiryClaimItem, NearExpiryBatch, QuarantinedItem } from "./types";

interface Props {
  initialQuarantined: QuarantinedItem[];
  initialNearExpiry: NearExpiryBatch[];
  initialClaims: ExpiryClaimItem[];
}

export function useQuarantineState({
  initialQuarantined,
  initialNearExpiry,
  initialClaims,
}: Props) {
  const [activeTab, setActiveTab] = useState<"quarantined" | "claims" | "near_expiry">("quarantined");
  const [quarantined, setQuarantined] = useState<QuarantinedItem[]>(initialQuarantined);
  const [nearExpiry, setNearExpiry] = useState<NearExpiryBatch[]>(initialNearExpiry);
  const [claims, setClaims] = useState<ExpiryClaimItem[]>(initialClaims);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState("all");
  const [selectedQuarantineIds, setSelectedQuarantineIds] = useState<string[]>([]);

  // Modals state
  const [quarantineModalBatch, setQuarantineModalBatch] = useState<NearExpiryBatch | null>(null);
  const [quarantineQty, setQuarantineQty] = useState(0);
  const [quarantineReason, setQuarantineReason] = useState<"expired" | "damaged" | "recalled">("expired");
  const [quarantineNotes, setQuarantineNotes] = useState("");
  const [settleModalClaim, setSettleModalClaim] = useState<ExpiryClaimItem | null>(null);
  const [settlementType, setSettlementType] = useState<"credit_note" | "replacement_stock" | "written_off">("credit_note");
  const [creditNoteNo, setCreditNoteNo] = useState("");
  const [settleNotes, setSettleNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const suppliersList = Array.from(
    new Set([...quarantined.map((q) => q.supplierName), ...nearExpiry.map((n) => n.supplierName || "Unassigned Distributor")].filter(Boolean))
  );

  const filteredQuarantined = quarantined.filter((item) => {
    if (item.status !== "quarantined") return false;
    if (selectedSupplierFilter !== "all" && item.supplierName !== selectedSupplierFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return item.medicineName.toLowerCase().includes(q) || item.batchNo.toLowerCase().includes(q) || item.supplierName.toLowerCase().includes(q);
  });

  const totalQuarantinedValPaise = quarantined.filter((q) => q.status === "quarantined").reduce((sum, q) => sum + q.totalPaise, 0);
  const totalClaimedPendingPaise = claims.filter((c) => c.status === "submitted").reduce((sum, c) => sum + c.totalPaise, 0);
  const totalSettledPaise = claims.filter((c) => c.status === "settled").reduce((sum, c) => sum + c.totalPaise, 0);

  const handleOpenQuarantine = (batch: NearExpiryBatch) => {
    setQuarantineModalBatch(batch);
    setQuarantineQty(batch.qtyOnHand);
    setQuarantineReason(batch.isExpired ? "expired" : "damaged");
    setQuarantineNotes("");
    setNotification(null);
  };

  const handleConfirmQuarantine = async () => {
    if (!quarantineModalBatch || quarantineQty <= 0) return;
    setIsSubmitting(true);
    setNotification(null);
    try {
      const res = await quarantineBatchAction({
        batchId: quarantineModalBatch.id,
        qty: quarantineQty,
        reason: quarantineReason,
        notes: quarantineNotes,
      });

      if (res.success) {
        setNotification({
          type: "success",
          text: `Successfully quarantined ${quarantineQty} units of ${quarantineModalBatch.medicineName} (${quarantineModalBatch.batchNo}). Stock isolated from POS.`,
        });
        setNearExpiry((prev) =>
          prev.map((b) => (b.id === quarantineModalBatch.id ? { ...b, qtyOnHand: b.qtyOnHand - quarantineQty } : b)).filter((b) => b.qtyOnHand > 0)
        );
        setQuarantined((prev) => [
          {
            id: res.quarantineId || `q-${Date.now()}`,
            storeId: "",
            batchId: quarantineModalBatch.id,
            medicineId: quarantineModalBatch.medicineId,
            medicineName: quarantineModalBatch.medicineName,
            genericName: quarantineModalBatch.genericName,
            packUnit: quarantineModalBatch.packUnit || "pack",
            looseUnit: quarantineModalBatch.looseUnit || "unit",
            batchNo: quarantineModalBatch.batchNo,
            expiryDate: quarantineModalBatch.expiryDate,
            supplierId: quarantineModalBatch.supplierId,
            supplierName: quarantineModalBatch.supplierName || "Unassigned Distributor",
            qty: quarantineQty,
            ratePaise: quarantineModalBatch.purchaseRatePaise,
            mrpPaise: quarantineModalBatch.mrpPaise,
            totalPaise: quarantineModalBatch.purchaseRatePaise * quarantineQty,
            reason: quarantineReason,
            status: "quarantined",
            claimId: null,
            quarantinedAt: new Date().toISOString(),
            notes: quarantineNotes,
          },
          ...prev,
        ]);
        setQuarantineModalBatch(null);
        setActiveTab("quarantined");
      } else {
        setNotification({ type: "error", text: res.error || "Failed to quarantine batch" });
      }
    } catch (err: unknown) {
      setNotification({ type: "error", text: err instanceof Error ? err.message : "Unexpected error during quarantine" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateSupplierClaim = async () => {
    if (selectedQuarantineIds.length === 0) return;
    const selectedItems = quarantined.filter((q) => selectedQuarantineIds.includes(q.id));
    const supplierId = selectedItems[0]?.supplierId;
    if (!supplierId) {
      setNotification({ type: "error", text: "Selected items must have an assigned supplier to generate a debit note." });
      return;
    }
    if (selectedItems.some((q) => q.supplierId !== supplierId)) {
      setNotification({ type: "error", text: "All selected items for a claim must belong to the same distributor/supplier." });
      return;
    }
    setIsSubmitting(true);
    setNotification(null);
    try {
      const res = await createSupplierExpiryClaimAction({
        supplierId,
        quarantineIds: selectedQuarantineIds,
        notes: `Distributor claim for ${selectedItems.length} quarantined batches`,
      });
      if (res.success && res.claimId && res.claimNo) {
        setNotification({
          type: "success",
          text: `Debit Claim ${res.claimNo} generated for ${formatINR(res.totalPaise || 0)}! Supplier account debited.`,
        });
        setQuarantined((prev) => prev.map((q) => (selectedQuarantineIds.includes(q.id) ? { ...q, status: "claimed", claimId: res.claimId } : q)));
        setClaims((prev) => [
          {
            id: res.claimId,
            claimNo: res.claimNo,
            supplierId,
            supplierName: selectedItems[0].supplierName,
            status: "submitted",
            totalPaise: res.totalPaise || 0,
            settlementType: null,
            supplierCreditNoteNo: null,
            notes: "Distributor claim for quarantined stock",
            createdAt: new Date().toISOString(),
            settledAt: null,
          },
          ...prev,
        ]);
        setSelectedQuarantineIds([]);
        setActiveTab("claims");
      } else {
        setNotification({ type: "error", text: res.error || "Failed to generate claim" });
      }
    } catch (err: unknown) {
      setNotification({ type: "error", text: err instanceof Error ? err.message : "Error generating claim" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSettle = async () => {
    if (!settleModalClaim) return;
    setIsSubmitting(true);
    setNotification(null);
    try {
      const res = await settleSupplierExpiryClaimAction({
        claimId: settleModalClaim.id,
        settlementType,
        supplierCreditNoteNo: creditNoteNo,
        notes: settleNotes,
      });
      if (res.success) {
        setNotification({
          type: "success",
          text: `Claim ${settleModalClaim.claimNo} settled via ${settlementType.replace("_", " ")}!`,
        });
        setClaims((prev) =>
          prev.map((c) =>
            c.id === settleModalClaim.id
              ? { ...c, status: res.status || "settled", settlementType, supplierCreditNoteNo: creditNoteNo || null, settledAt: new Date().toISOString() }
              : c
          )
        );
        setSettleModalClaim(null);
      } else {
        setNotification({ type: "error", text: res.error || "Failed to settle claim" });
      }
    } catch (err: unknown) {
      setNotification({ type: "error", text: err instanceof Error ? err.message : "Error settling claim" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    activeTab,
    setActiveTab,
    quarantined,
    nearExpiry,
    claims,
    searchQuery,
    setSearchQuery,
    selectedSupplierFilter,
    setSelectedSupplierFilter,
    selectedQuarantineIds,
    setSelectedQuarantineIds,
    quarantineModalBatch,
    setQuarantineModalBatch,
    quarantineQty,
    setQuarantineQty,
    quarantineReason,
    setQuarantineReason,
    quarantineNotes,
    setQuarantineNotes,
    settleModalClaim,
    setSettleModalClaim,
    settlementType,
    setSettlementType,
    creditNoteNo,
    setCreditNoteNo,
    settleNotes,
    setSettleNotes,
    isSubmitting,
    notification,
    setNotification,
    suppliersList,
    filteredQuarantined,
    totalQuarantinedValPaise,
    totalClaimedPendingPaise,
    totalSettledPaise,
    handleOpenQuarantine,
    handleConfirmQuarantine,
    handleGenerateSupplierClaim,
    handleConfirmSettle,
  };
}
