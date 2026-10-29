import { requirePagePermission } from "@/server/rbac";
import { getPurchaseOrders } from "@/app/actions/purchase-orders";
import { getSuppliers } from "@/app/actions/suppliers";
import { OrdersListClient } from "./OrdersListClient";

export const metadata = { title: "Purchase Orders" };

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; supplierId?: string }>;
}) {
  await requirePagePermission("purchase.view");
  const params = await searchParams;

  const [orders, suppliers] = await Promise.all([
    getPurchaseOrders({
      status: params.status,
      supplierId: params.supplierId,
    }),
    getSuppliers(),
  ]);

  return <OrdersListClient initialOrders={orders} suppliers={suppliers} initialStatus={params.status || "all"} />;
}

