import { PageHeader } from "@/app/components/ui";
import Link from "next/link";
import { ShoppingBag, Sparkles, MessageSquare, Globe, Truck, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Omnichannel Orders (Coming Soon) — MediFlow",
};

export default function OrdersPage() {
  return (
    <div className="page space-y-6">
      <PageHeader
        eyebrow="Omnichannel & eRetail"
        title="Omnichannel Orders"
        description="Unified incoming orders from WhatsApp, pharmacy eRetail app, phone reservations, and website checkout."
        actions={
          <Link href="/dashboard/sales/pos" className="btn btn-primary btn-sm">
            <ShoppingBag className="h-4 w-4" /> Open POS Terminal
          </Link>
        }
      />

      <div className="card p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          <Sparkles className="h-3.5 w-3.5" />
          Coming Soon
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-ink-900">
            Omnichannel Order Hub is under development
          </h2>
          <p className="text-sm text-ink-600 leading-relaxed">
            This module is not yet released. Soon you will be able to receive, verify prescriptions,
            and dispatch customer orders from WhatsApp, your pharmacy storefront, and delivery partners
            directly into your POS billing queue.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
          <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3.5 space-y-1">
            <MessageSquare className="h-4 w-4 text-brand-600" />
            <div className="text-xs font-semibold text-ink-900">WhatsApp Carts</div>
            <p className="text-[11.5px] text-ink-500">
              Auto-sync prescription photos &amp; refill requests from WhatsApp.
            </p>
          </div>
          <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3.5 space-y-1">
            <Globe className="h-4 w-4 text-brand-600" />
            <div className="text-xs font-semibold text-ink-900">Online Storefront</div>
            <p className="text-[11.5px] text-ink-500">
              Live store stock visibility &amp; click-and-collect reservations.
            </p>
          </div>
          <div className="rounded-xl border border-ink-150 bg-ink-50/60 p-3.5 space-y-1">
            <Truck className="h-4 w-4 text-brand-600" />
            <div className="text-xs font-semibold text-ink-900">Delivery Dispatch</div>
            <p className="text-[11.5px] text-ink-500">
              Rider assignment, COD/UPI collection &amp; proof of delivery.
            </p>
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <Link href="/dashboard" className="btn btn-secondary btn-sm">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
          <Link href="/dashboard/sales/promise-orders" className="btn btn-secondary btn-sm">
            View Promise Orders
          </Link>
        </div>
      </div>
    </div>
  );
}
