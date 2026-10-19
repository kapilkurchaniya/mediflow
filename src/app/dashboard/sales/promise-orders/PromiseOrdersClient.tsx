"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookmarkCheck,
  Plus,
  Clock,
  CheckCircle2,
  Package,
  Ban,
  Phone,
  User,
  Pill,
  Calendar,
  Layers,
  Search,
} from "lucide-react";
import { updatePromiseOrderStatus } from "@/app/actions/promise-orders";

interface PromiseOrderItem {
  id: string;
  customerName: string;
  customerPhone: string;
  medicineId: string;
  medicineName: string;
  qtyRequested: number;
  status: string;
  saleId: string | null;
  purchaseOrderId: string | null;
  notes: string | null;
  promisedDate: string | null;
  createdAt: Date;
  customerId: string | null;
  rackCode: string | null;
}

export function PromiseOrdersClient({ initialOrders }: { initialOrders: PromiseOrderItem[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = orders.filter((o) => {
    if (filter !== "all" && o.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        o.medicineName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function handleStatusChange(
    id: string,
    newStatus: "pending" | "ordered" | "fulfilled" | "cancelled"
  ) {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: newStatus } : o))
    );
    await updatePromiseOrderStatus(id, newStatus);
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
            <Clock className="h-3 w-3" /> Pending Order
          </span>
        );
      case "ordered":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-100 text-sky-800">
            <Package className="h-3 w-3" /> Ordered via PO
          </span>
        );
      case "fulfilled":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="h-3 w-3" /> Fulfilled
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-800">
            <Ban className="h-3 w-3" /> Cancelled
          </span>
        );
      default:
        return <span className="text-xs text-ink-600">{status}</span>;
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Filter & New Order Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-150 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === "all" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            All Promises ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === "pending" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            Pending ({orders.filter((o) => o.status === "pending").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("ordered")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === "ordered" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            PO Raised ({orders.filter((o) => o.status === "ordered").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("fulfilled")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === "fulfilled" ? "bg-brand-600 text-white shadow-xs" : "text-ink-600 hover:bg-ink-100"
            }`}
          >
            Fulfilled ({orders.filter((o) => o.status === "fulfilled").length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer or drug..."
              className="input text-xs pl-8 py-1.5 w-48"
            />
          </div>

          <Link
            href="/dashboard/sales/promise-orders/new"
            className="btn btn-primary text-xs shrink-0"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Record Promise Order
          </Link>
        </div>
      </div>

      {/* Orders Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table w-full text-xs">
            <thead>
              <tr className="border-b border-ink-150 bg-ink-50/50 text-left font-semibold text-ink-600">
                <th className="py-2.5 px-4">Customer Details</th>
                <th className="py-2.5 px-4">Requested Medicine</th>
                <th className="py-2.5 px-4 text-center">Qty</th>
                <th className="py-2.5 px-4">Promised Date</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Notes</th>
                <th className="py-2.5 px-4 text-right">Update Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-150">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-ink-400">
                    No promise orders found for the current selection.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-ink-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-ink-900 flex items-center gap-1.5">
                        <User className="h-3 w-3 text-ink-400" />
                        {order.customerName}
                      </div>
                      <div className="text-[11px] font-mono text-ink-500 flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3 text-ink-400" />
                        {order.customerPhone}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-ink-900 flex items-center gap-1.5">
                        <Pill className="h-3.5 w-3.5 text-brand-600" />
                        {order.medicineName}
                      </div>
                      {order.rackCode && (
                        <div className="text-[10px] font-mono text-ink-500 mt-0.5 flex items-center gap-1">
                          <Layers className="h-3 w-3 text-ink-400" /> Rack: {order.rackCode}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-mono font-bold text-ink-900">
                      {order.qtyRequested}
                    </td>
                    <td className="py-3 px-4 text-ink-600 whitespace-nowrap">
                      {order.promisedDate ? (
                        <span className="flex items-center gap-1 text-[11px]">
                          <Calendar className="h-3 w-3 text-ink-400" />
                          {order.promisedDate}
                        </span>
                      ) : (
                        <span className="text-ink-400 text-[11px]">As soon as in stock</span>
                      )}
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(order.status)}</td>
                    <td className="py-3 px-4 text-ink-600 max-w-[150px] truncate">
                      {order.notes || "—"}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {order.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(order.id, "ordered")}
                            className="btn btn-secondary text-[11px] py-1 px-2 text-sky-700 hover:bg-sky-50"
                            title="Mark as PO Raised"
                          >
                            Mark Ordered
                          </button>
                        )}

                        {order.status !== "fulfilled" && order.status !== "cancelled" && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(order.id, "fulfilled")}
                            className="btn btn-primary text-[11px] py-1 px-2 bg-emerald-600 hover:bg-emerald-700"
                            title="Mark as Delivered to Customer"
                          >
                            Fulfill
                          </button>
                        )}

                        {order.status !== "cancelled" && order.status !== "fulfilled" && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(order.id, "cancelled")}
                            className="btn btn-ghost text-[11px] py-1 px-1.5 text-ink-400 hover:text-red-600"
                            title="Cancel Request"
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
