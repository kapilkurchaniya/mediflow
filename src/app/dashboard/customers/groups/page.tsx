import { PageHeader } from "@/app/components/ui";
import { getCustomerGroups } from "@/app/actions/customer-groups";
import { getCustomers } from "@/app/actions/customers";
import { CustomerGroupsClient } from "./CustomerGroupsClient";
import Link from "next/link";
import { Users } from "lucide-react";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "Family Groups & Ledgers — MediFlow",
};

export default async function CustomerGroupsPage() {
  await requirePagePermission("customer.view");
  const [groups, customers] = await Promise.all([
    getCustomerGroups(),
    getCustomers("", 500),
  ]);

  return (
    <div className="page space-y-6">
      <PageHeader
        backHref="/dashboard/customers"
        title="Family Groups & Household Ledgers"
        description="Unified credit limits, family balance pooling, and combined prescription order statements across households."
        actions={
          <Link href="/dashboard/customers" className="btn btn-secondary btn-sm">
            <Users className="h-4 w-4" /> All Customers
          </Link>
        }
      />

      <CustomerGroupsClient
        initialGroups={groups}
        allCustomers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
      />
    </div>
  );
}
