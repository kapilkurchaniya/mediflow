import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/rbac";
import { getPurchaseOrder } from "@/app/actions/purchase-orders";
import { OrderDetailClient } from "./OrderDetailClient";

export const metadata = { title: "Purchase Order Details" };

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("purchase.view");
  const resolved = await params;

  const po = await getPurchaseOrder(resolved.id);
  if (!po) return notFound();

  return <OrderDetailClient po={po} />;
}

