"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Package,
  ShoppingBag,
  Clock,
  CheckCircle2,
  Phone,
  ArrowRight,
  Search,
  MessageSquare,
  Globe,
  Truck,
  RotateCcw,
  Plus,
} from "lucide-react";
import { updateOrderStatus } from "@/app/actions/external-orders";
import clsx from "clsx";

interface ExternalOrderItem {
  id: string;
  source: string;
  orderNo: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  status: string;
  items: any;
  totalAmount: number | null;
  notes: string | null;
  saleId: string | null;
  createdAt: Date;
}

export function OrdersClient({ initialOrders }: { initialOrders: ExternalOrderItem[] }) {
  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = orders.filter((o) => {
    if (filter !== "all" && o.status !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        o.orderNo.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        (o.notes && o.notes.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    const res = await updateOrderStatus(orderId, nextStatus);
    if (res.success) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o)));
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source.toLowerCase()) {
      case "whatsapp":
        return <span className="badge badge-success !text-[10px] flex items-center gap-1"><MessageSquare className="h-3 w-3" /> WhatsApp</span>;
      case "eretail":
        return <span className="badge badge-info !text-[10px] flex items-center gap-1"><Globe className="h-3 w-3" /> eRetail App</span>;
      case "phone":
        return <span className="badge badge-warning !text-[10px] flex items-center gap-1"><Phone className="h-3 w-3" /> Phone Call</span>;
      default:
        return <span className="badge badge-neutral !text-[10px] capitalize">{source}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Pipeline Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {["all", "received", "preparing", "ready", "delivered", "cancelled"].map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={clsx("btn btn-sm capitalize", filter === st ? "btn-primary" : "btn-ghost")}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
          <input
            type="text"
            placeholder="Search order #, customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input input-sm pl-9 w-full"
          />
        </div>
      </div>

      {/* Orders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full card p-12 text-center text-ink-400">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
            No customer orders matching the selected filter.
          </div>
        ) : (
          filtered.map((order) => {
            const items = Array.isArray(order.items) ? order.items : [];

            return (
              <div key={order.id} className="card p-5 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink-900">{order.orderNo}</span>
                        {getSourceBadge(order.source)}
                      </div>
                      <h4 className="font-semibold text-sm text-ink-900 mt-1">{order.customerName}</h4>
                      <span className="text-xs text-ink-500 font-mono flex items-center gap-1 mt-0.5">
                        <Phone className="h-3 w-3" /> +{order.customerPhone}
                      </span>
                    </div>

                    <span
                      className={clsx(
                        "badge text-[11px] capitalize",
                        order.status === "received"
                          ? "badge-warning"
                          : order.status === "preparing"
                          ? "badge-info"
                          : order.status === "ready"
                          ? "badge-success"
                          : order.status === "delivered"
                          ? "badge-neutral"
                          : "badge-error"
                      )}
                    >
                      {order.status}
                    </span>
                  </div>

                  {/* Items Preview */}
                  <div className="pt-2 border-t border-ink-100 text-xs text-ink-600 space-y-1 bg-ink-50/50 p-2.5 rounded-lg">
                    {items.slice(0, 3).map((it: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span className="truncate max-w-[180px]">{it.name}</span>
                        <span className="font-mono text-ink-500">×{it.qty}</span>
                      </div>
                    ))}
                    {items.length > 3 && (
                      <div className="text-[11px] text-ink-400 italic">+{items.length - 3} more items</div>
                    )}
                  </div>

                  {order.notes && (
                    <p className="text-[11.5px] text-ink-500 italic bg-amber-50/50 p-1.5 rounded border border-amber-100">
                      Note: {order.notes}
                    </p>
                  )}
                </div>

                <div className="pt-3 border-t border-ink-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-ink-400">Order Value</span>
                    <span className="font-mono font-bold text-sm text-ink-900">
                      ₹{((order.totalAmount || 0) / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    {order.status === "received" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(order.id, "preparing")}
                        className="btn btn-secondary btn-xs flex-1"
                      >
                        Accept & Prepare
                      </button>
                    )}
                    {order.status === "preparing" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(order.id, "ready")}
                        className="btn btn-primary btn-xs flex-1"
                      >
                        Mark Ready
                      </button>
                    )}
                    {order.status === "ready" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus(order.id, "delivered")}
                        className="btn btn-primary btn-xs flex-1"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Mark Delivered
                      </button>
                    )}
                    <Link
                      href={`/dashboard/orders/${order.id}`}
                      className="btn btn-ghost btn-xs text-ink-500"
                    >
                      View Details →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
