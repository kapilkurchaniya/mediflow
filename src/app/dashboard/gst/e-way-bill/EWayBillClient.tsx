"use client";

import { useState } from "react";
import { EWayBillMetrics } from "./EWayBillMetrics";
import { EWayBillTable } from "./EWayBillTable";
import { UpdateVehicleModal } from "./UpdateVehicleModal";
import { CancelEWayBillModal } from "./CancelEWayBillModal";
import type { EWayBillItem, ValidityStatus } from "./types";

export type { EWayBillItem };

export function EWayBillClient({
  initialData,
  currentFilter = "all",
}: {
  initialData: { items: EWayBillItem[]; total: number };
  currentFilter?: "all" | "active" | "expiring_soon" | "expired" | "cancelled";
}) {
  const [filter, setFilter] = useState<"all" | "active" | "expiring_soon" | "expired" | "cancelled">(currentFilter);
  const [search, setSearch] = useState("");
  const [updateDoc, setUpdateDoc] = useState<EWayBillItem | null>(null);
  const [cancelDoc, setCancelDoc] = useState<EWayBillItem | null>(null);
  const [now] = useState(() => Date.now());

  function getValidityStatus(item: EWayBillItem): ValidityStatus {
    if (item.status === "cancelled") {
      return {
        badge: "bg-ink-100 text-ink-700",
        label: "Cancelled",
        isUrgent: false,
        hoursLeft: 0,
        canCancel: false,
      };
    }

    const createdTime = item.eWayBillDate ? new Date(item.eWayBillDate).getTime() : now;
    const canCancel = now - createdTime <= 24 * 60 * 60 * 1000;

    if (!item.eWayBillValidTill) {
      return {
        badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
        label: "Active",
        isUrgent: false,
        hoursLeft: 48,
        canCancel,
      };
    }

    const validTill = new Date(item.eWayBillValidTill).getTime();
    const msLeft = validTill - now;
    const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));

    if (msLeft <= 0) {
      return {
        badge: "bg-rose-50 text-rose-700 border border-rose-200",
        label: "Expired",
        isUrgent: true,
        hoursLeft: 0,
        canCancel: false,
      };
    }
    if (hoursLeft < 12) {
      return {
        badge: "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse",
        label: `${hoursLeft}h left (Expiring)`,
        isUrgent: true,
        hoursLeft,
        canCancel,
      };
    }
    const daysLeft = Math.ceil(hoursLeft / 24);
    return {
      badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      label: daysLeft > 1 ? `${daysLeft} days active` : `${hoursLeft}h active`,
      isUrgent: false,
      hoursLeft,
      canCancel,
    };
  }

  // Filtered list
  const filtered = initialData.items.filter((item) => {
    const vStat = getValidityStatus(item);

    if (filter === "active") {
      if (item.status === "cancelled" || vStat.hoursLeft <= 0) return false;
    } else if (filter === "expiring_soon") {
      if (item.status === "cancelled" || vStat.hoursLeft <= 0 || vStat.hoursLeft >= 12) return false;
    } else if (filter === "expired") {
      if (item.status === "cancelled" || vStat.hoursLeft > 0) return false;
    } else if (filter === "cancelled") {
      if (item.status !== "cancelled") return false;
    }

    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      (item.eWayBillNo && item.eWayBillNo.toLowerCase().includes(term)) ||
      (item.docNo && item.docNo.toLowerCase().includes(term)) ||
      (item.partyName && item.partyName.toLowerCase().includes(term)) ||
      (item.partyGstin && item.partyGstin.toLowerCase().includes(term)) ||
      (item.vehicleNo && item.vehicleNo.toLowerCase().includes(term))
    );
  });

  // Summary Metrics
  const activeCount = initialData.items.filter(
    (i) => i.status === "active" && getValidityStatus(i).hoursLeft > 0,
  ).length;
  const expiringCount = initialData.items.filter(
    (i) => i.status === "active" && getValidityStatus(i).hoursLeft > 0 && getValidityStatus(i).hoursLeft < 12,
  ).length;
  const activeValue = initialData.items
    .filter((i) => i.status === "active" && getValidityStatus(i).hoursLeft > 0)
    .reduce((sum, i) => sum + (i.total || 0), 0);

  return (
    <div className="space-y-6">
      {/* Statutory Metrics Cards */}
      <EWayBillMetrics
        total={initialData.total}
        activeCount={activeCount}
        expiringCount={expiringCount}
        activeValue={activeValue}
      />

      {/* Filter Tabs, Search & Table */}
      <EWayBillTable
        items={filtered}
        filter={filter}
        setFilter={setFilter}
        search={search}
        setSearch={setSearch}
        getValidityStatus={getValidityStatus}
        onOpenUpdate={(item) => setUpdateDoc(item)}
        onOpenCancel={(item) => setCancelDoc(item)}
      />

      {/* Update Vehicle Modal */}
      {updateDoc && (
        <UpdateVehicleModal
          updateDoc={updateDoc}
          onClose={() => setUpdateDoc(null)}
          onSuccess={() => {
            setUpdateDoc(null);
            window.location.reload();
          }}
        />
      )}

      {/* 24-Hour Statutory Cancel Modal */}
      {cancelDoc && (
        <CancelEWayBillModal
          cancelDoc={cancelDoc}
          onClose={() => setCancelDoc(null)}
          onSuccess={() => {
            setCancelDoc(null);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
