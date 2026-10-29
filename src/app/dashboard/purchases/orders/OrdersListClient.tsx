"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ClipboardList, Search, Truck } from "lucide-react";
import { PageHeader, EmptyState } from "@/app/components/ui";
import { formatINR } from "@/lib/format";
import { format } from "date-fns";

export interface OrderListItem {
  id: string;
  poNo: string;
  status: string;
  expectedDate: string | null;
  estimatedTotal: number | null;
  createdAt: Date;
  supplierName: string;
  supplierPhone: string | null;
  itemsCount: number;
}

export function OrdersListClient({
  initialOrders,
  suppliers,
  initialStatus,
}: {
  initialOrders: OrderListItem[];
  suppliers: { id: string; name: string }[];
  initialStatus: string;
}) {
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = initialOrders.filter((order) => {
    if (statusFilter !== "all" && order.status !== statusFilter) return false;
    if (supplierFilter !== "all" && order.supplierName !== supplierFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNo = order.poNo.toLowerCase().includes(q);
      const matchSup = order.supplierName.toLowerCase().includes(q);
      if (!matchNo && !matchSup) return false;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <span className="badge bg-ink-100 text-ink-700 font-semibold text-xs">Draft</span>;
      case "approved":
        return <span className="badge bg-blue-100 text-blue-700 font-semibold text-xs">Approved</span>;
      case "sent":
        return <span className="badge bg-indigo-100 text-indigo-700 font-semibold text-xs">Sent</span>;
      case "partially_received":
        return <span className="badge bg-amber-100 text-amber-800 font-semibold text-xs">Partially Received</span>;
      case "received":
        return <span className="badge bg-emerald-100 text-emerald-800 font-semibold text-xs">Received</span>;
      case "cancelled":
        return <span className="badge bg-rose-100 text-rose-800 font-semibold text-xs">Cancelled</span>;
      default:
        return <span className="badge text-xs">{status}</span>;
    }
  };

  const statusOptions = [
    { id: "all", label: "All Orders" },
    { id: "draft", label: "Draft" },
    { id: "approved", label: "Approved" },
    { id: "sent", label: "Sent" },
    { id: "partially_received", label: "Partially Received" },
    { id: "received", label: "Received" },
    { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Purchase Orders"
        description="Plan supplier replenishments, manage PO approvals, and track delivery receipts."
        actions={
          <Link href="/dashboard/purchases/orders/new" className="btn btn-primary">
            <Plus className="w-4 h-4 mr-1" /> New purchase order
          </Link>
        }
      />

      {/* Filter and Search Bar */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {statusOptions.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === tab.id
                    ? "bg-brand-600 text-white shadow-2xs"
                    : "bg-ink-50 text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Supplier dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="supplier-select" className="text-xs text-ink-500 font-medium">
              Supplier:
            </label>
            <select
              id="supplier-select"
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="text-xs py-1.5 px-2.5 rounded-lg border border-ink-200 bg-white text-ink-800 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
            >
              <option value="all">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by PO number or supplier name..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-ink-200 bg-white placeholder-ink-400 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="card overflow-hidden">
        {filtered.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Created Date</th>
                  <th>Supplier</th>
                  <th>Expected Delivery</th>
                  <th className="text-center">Items</th>
                  <th className="text-right">Estimated Total</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((po) => (
                  <tr key={po.id} className="hover:bg-ink-50/70 transition-colors">
                    <td className="font-mono font-semibold text-brand-700">
                      <Link href={`/dashboard/purchases/orders/${po.id}`} className="hover:underline">
                        {po.poNo}
                      </Link>
                    </td>
                    <td className="text-ink-600 text-xs">
                      {format(new Date(po.createdAt), "dd MMM yyyy")}
                    </td>
                    <td>
                      <div className="font-medium text-ink-900">{po.supplierName}</div>
                      {po.supplierPhone && (
                        <div className="text-[11px] text-ink-500 font-mono">{po.supplierPhone}</div>
                      )}
                    </td>
                    <td className="text-ink-600 text-xs">
                      {po.expectedDate ? format(new Date(po.expectedDate), "dd MMM yyyy") : "—"}
                    </td>
                    <td className="text-center text-xs font-semibold num">{po.itemsCount}</td>
                    <td className="text-right font-mono font-semibold text-ink-900">
                      {formatINR(po.estimatedTotal || 0)}
                    </td>
                    <td className="text-center">{getStatusBadge(po.status)}</td>
                    <td className="text-right">
                      <Link
                        href={`/dashboard/purchases/orders/${po.id}`}
                        className="btn btn-ghost text-xs py-1 px-2.5 text-brand-700 hover:text-brand-800"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8">
            <EmptyState
              icon={ClipboardList}
              title="No purchase orders found"
              description={
                statusFilter !== "all" || supplierFilter !== "all" || searchQuery
                  ? "Try clearing your filters or search terms."
                  : "Draft your first purchase order to organize supplier procurement."
              }
              action={
                <Link href="/dashboard/purchases/orders/new" className="btn btn-primary">
                  <Plus className="w-4 h-4 mr-1" /> New purchase order
                </Link>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

