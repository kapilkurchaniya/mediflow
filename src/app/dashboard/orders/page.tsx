import { PageHeader } from "@/app/components/ui";
import { getExternalOrders } from "@/app/actions/external-orders";
import { OrdersClient } from "./OrdersClient";
import Link from "next/link";
import { ShoppingBag, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Omnichannel Orders — MediFlow",
};

export default async function OrdersPage() {
  const orders = await getExternalOrders();

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Omnichannel & eRetail Orders"
        description="Unified incoming orders from WhatsApp, pharmacy eRetail app, phone reservations, and website checkout."
        actions={
          <Link href="/dashboard/sales/pos" className="btn btn-primary btn-sm">
            <ShoppingBag className="h-4 w-4" /> Open POS Terminal
          </Link>
        }
      />

      <OrdersClient initialOrders={orders} />
    </div>
  );
}
