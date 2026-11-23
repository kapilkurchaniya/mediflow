"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import {
  AlertTriangle,
  RotateCcw,
  Search,
  Filter,
  Truck,
  ArrowRight,
  Clock,
  CheckCircle2,
} from "lucide-react";
import type { ExpiryReturnCandidate } from "@/server/domain/purchasing/purchase-returns";

interface ExpiryReturnsClientProps {
  candidates: ExpiryReturnCandidate[];
}

export function ExpiryReturnsClient({ candidates }: ExpiryReturnsClientProps) {
  const [search, setSearch] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "expired" | "near_expiry">("all");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  const suppliers = Array.from(
    new Map(
      candidates
        .filter((c) => c.supplierId && c.supplierName)
        .map((c) => [c.supplierId!, c.supplierName!])
    ).entries()
  );

  const filtered = candidates.filter((c) => {
    const isExpired = c.expiryDate <= today;
    if (statusFilter === "expired" && !isExpired) return false;
    if (statusFilter === "near_expiry" && isExpired) return false;

    if (selectedSupplier !== "all" && c.supplierId !== selectedSupplier) {
      return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        c.medicineName.toLowerCase().includes(q) ||
        c.batchNo.toLowerCase().includes(q) ||
        (c.supplierName && c.supplierName.toLowerCase().includes(q)) ||
        (c.purchaseNo && c.purchaseNo.toLowerCase().includes(q));
      if (!match) return false;
    }

    return true;
  });

  const totalReclaimValue = filtered.reduce(
    (acc, c) => acc + c.qtyOnHand * c.purchaseRate,
    0
  );
  const totalUnits = filtered.reduce((acc, c) => acc + c.qtyOnHand, 0);

  // Group by supplier for easy batch return
  const supplierGroups = new Map<string, ExpiryReturnCandidate[]>();
  for (const c of filtered) {
    const key = c.supplierName || "Unknown Supplier";
    const existing = supplierGroups.get(key) || [];
    existing.push(c);
    supplierGroups.set(key, existing);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expiry Returns & Stock Recovery"
        description="Identify near-expiry and expired stock to generate vendor debit notes before cutoff deadlines (B2.3)"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/purchases/returns"
              className="btn btn-secondary inline-flex items-center gap-1.5 text-xs"
            >
              <RotateCcw className="h-4 w-4" />
              View Debit Notes
            </Link>
            <Link
              href="/dashboard/purchases/returns/new"
              className="btn btn-primary inline-flex items-center gap-1.5 text-xs"
            >
              New Debit Note
            </Link>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Eligible Batches
          </span>
          <p className="mt-2 text-2xl font-bold num">{filtered.length}</p>
          <span className="text-xs text-muted-foreground mt-1">
            {totalUnits} units across inventory
          </span>
        </div>

        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Estimated Reclaim Value
          </span>
          <p className="mt-2 text-2xl font-bold num text-amber-600 dark:text-amber-400">
            {formatINR(totalReclaimValue)}
          </p>
          <span className="text-xs text-muted-foreground mt-1">
            Based on purchase cost rate
          </span>
        </div>

        <div className="card p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Vendors With Expired Stock
          </span>
          <p className="mt-2 text-2xl font-bold num text-blue-600 dark:text-blue-400">
            {supplierGroups.size}
          </p>
          <span className="text-xs text-muted-foreground mt-1">
            Eligible for supplier return
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by medicine, batch number, or supplier..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 w-full text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "expired" | "near_expiry")}
            className="input text-xs w-36"
          >
            <option value="all">All (Expired &amp; Next 60d)</option>
            <option value="expired">Expired Only</option>
            <option value="near_expiry">Near Expiry Only</option>
          </select>

          <select
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            className="input text-xs w-44"
          >
            <option value="all">All Suppliers ({suppliers.length})</option>
            {suppliers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Batches Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Medicine & Batch</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Expiry Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">In Stock</th>
                <th className="px-4 py-3 text-right">Purchase Rate</th>
                <th className="px-4 py-3 text-right">Reclaim Value</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                    <p className="font-medium">No expired or near-expiry batches found</p>
                    <p className="text-xs mt-1">All inventory batches are well within expiry limits.</p>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const isExpired = item.expiryDate <= today;
                  const value = item.qtyOnHand * item.purchaseRate;

                  return (
                    <tr key={item.batchId} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <span className="font-semibold text-foreground block">
                          {item.medicineName}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          Batch: {item.batchNo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="font-medium text-foreground flex items-center gap-1 flex-wrap">
                          <Truck className="h-3 w-3 text-muted-foreground shrink-0" />
                          {item.supplierName || "Direct / Local"}
                          {item.isPendingSupplier && (
                            <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 text-[10px]">
                              Unregistered
                            </span>
                          )}
                        </span>
                        {item.purchaseNo && (
                          <span className="text-[11px] text-muted-foreground block num">
                            GRN: {item.purchaseNo}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs num font-semibold whitespace-nowrap">
                        {item.expiryDate}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {isExpired ? (
                          <span className="badge bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 font-semibold text-[11px]">
                            Expired
                          </span>
                        ) : (
                          <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 font-semibold text-[11px]">
                            Near Expiry
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold num text-foreground">
                        {item.qtyOnHand}
                      </td>
                      <td className="px-4 py-3 text-right num text-xs">
                        {formatINR(item.purchaseRate)}
                      </td>
                      <td className="px-4 py-3 text-right num font-semibold text-amber-600 dark:text-amber-400">
                        {formatINR(value)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.purchaseId ? (
                          <Link
                            href={`/dashboard/purchases/returns/new?purchaseId=${item.purchaseId}`}
                            className="btn btn-secondary !py-1 !px-2.5 text-xs inline-flex items-center gap-1"
                          >
                            Return
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        ) : (
                          <Link
                            href="/dashboard/purchases/returns/new"
                            className="btn btn-secondary !py-1 !px-2.5 text-xs inline-flex items-center gap-1"
                          >
                            Return
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
