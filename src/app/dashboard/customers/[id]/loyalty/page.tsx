import { PageHeader } from "@/app/components/ui";
import { getCustomerLoyalty } from "@/app/actions/loyalty";
import { CustomerLoyaltyClient } from "./CustomerLoyaltyClient";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Settings } from "lucide-react";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "Customer Loyalty Points — MediFlow",
};

export default async function CustomerLoyaltyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("customer.view");
  const { id } = await params;
  const data = await getCustomerLoyalty(id);

  if (!data) {
    notFound();
  }

  return (
    <div className="page space-y-6">
      <PageHeader
        backHref="/dashboard/customers"
        title={`${data.customer.name} — Loyalty Points`}
        description={`Reward points statement and redemption transactions for +${data.customer.phone || "No Phone"}.`}
        actions={
          <Link href="/dashboard/settings/loyalty" className="btn btn-secondary btn-sm">
            <Settings className="h-4 w-4" /> Loyalty Rules
          </Link>
        }
      />

      <CustomerLoyaltyClient customer={data.customer} history={data.history} />
    </div>
  );
}
