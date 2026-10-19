import { PageHeader } from "@/app/components/ui";
import { getOrderById } from "@/app/actions/external-orders";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Package,
  Phone,
  User,
  ShoppingBag,
  Printer,
  CheckCircle2,
  Calendar,
  Clock,
  ArrowRight,
} from "lucide-react";

export const metadata = {
  title: "Order Details — MediFlow",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await getOrderById(id);

  if (!order) {
    notFound();
  }

  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="page space-y-6 max-w-4xl">
      <PageHeader
        backHref="/dashboard/orders"
        title={`Order ${order.orderNo}`}
        description={`Received from ${order.source.toUpperCase()} on ${new Date(
          order.createdAt
        ).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/sales/pos"
              className="btn btn-primary btn-sm"
            >
              <ShoppingBag className="h-4 w-4" /> Convert to POS Bill
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 space-y-1">
          <span className="text-xs text-ink-500 font-medium">Customer Details</span>
          <div className="font-semibold text-sm text-ink-900">{order.customerName}</div>
          <div className="text-xs text-ink-600 font-mono flex items-center gap-1">
            <Phone className="h-3 w-3" /> +{order.customerPhone}
          </div>
        </div>

        <div className="card p-4 space-y-1">
          <span className="text-xs text-ink-500 font-medium">Order Status</span>
          <div>
            <span className="badge badge-primary uppercase text-xs font-bold">{order.status}</span>
          </div>
          <div className="text-xs text-ink-400 capitalize">Source: {order.source}</div>
        </div>

        <div className="card p-4 space-y-1">
          <span className="text-xs text-ink-500 font-medium">Total Payable</span>
          <div className="text-xl font-bold font-mono text-ink-900">
            ₹{((order.totalAmount || 0) / 100).toFixed(2)}
          </div>
          <div className="text-[11px] text-ink-400">{items.length} items ordered</div>
        </div>
      </div>

      {/* Items Table */}
      <div className="card overflow-hidden">
        <div className="p-4 border-b border-ink-150 bg-ink-50/50">
          <h3 className="font-semibold text-sm text-ink-900">Ordered Items</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Medicine / Item</th>
                <th className="text-center">Quantity</th>
                <th className="text-right">Rate (₹)</th>
                <th className="text-right">Line Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any, idx: number) => {
                const lineTotal = (it.qty || 1) * (it.rate || 0);
                return (
                  <tr key={idx}>
                    <td className="font-medium text-xs text-ink-900">{it.name}</td>
                    <td className="text-center font-mono font-bold text-xs">{it.qty}</td>
                    <td className="text-right font-mono text-xs">₹{((it.rate || 0) / 100).toFixed(2)}</td>
                    <td className="text-right font-mono text-xs font-bold text-ink-900">
                      ₹{(lineTotal / 100).toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {order.notes && (
        <div className="card p-4 bg-amber-50/50 border-amber-200">
          <h4 className="font-semibold text-xs text-amber-900">Customer Instructions</h4>
          <p className="text-xs text-amber-800 mt-1">{order.notes}</p>
        </div>
      )}
    </div>
  );
}
