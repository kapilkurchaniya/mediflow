import { PageHeader } from "@/app/components/ui";
import { getPromiseOrders } from "@/app/actions/promise-orders";
import { PromiseOrdersClient } from "./PromiseOrdersClient";
import { requirePagePermission } from "@/server/rbac";

export const dynamic = "force-dynamic";

export default async function PromiseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePagePermission("sale.view");
  const resolved = await searchParams;
  const orders = await getPromiseOrders({ status: resolved.status });

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/sales"
        eyebrow="Lost Sales Prevention & Customer Reservation"
        title="Promise Orders Register"
        description="Track patient demands for out-of-stock medicines, raise purchase orders, and notify customers when stock arrives."
      />

      <PromiseOrdersClient initialOrders={orders} />
    </div>
  );
}
