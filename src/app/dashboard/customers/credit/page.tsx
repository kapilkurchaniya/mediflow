import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/app/components/ui";
import { requirePagePermission } from "@/server/rbac";
import { getCustomerUdhaarDashboardAction } from "@/app/actions/customer-credit";
import { UdhaarClient } from "./UdhaarClient";

export const metadata = { title: "Customer Udhaar & Dues" };

export default async function CustomerCreditLedgerPage() {
  await requirePagePermission("accounting.post");
  const initial = await getCustomerUdhaarDashboardAction();

  return (
    <div className="page space-y-6">
      <PageHeader
        eyebrow="Customer Receivables"
        title="Customer Udhaar & Credit Ledger"
        description="Track partial payments, full customer purchase history, total pending dues, and mark invoices paid as amounts are received."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/customers" className="btn btn-secondary">
              All Customers
            </Link>
            <Link href="/dashboard/sales/pos" className="btn btn-primary">
              <Plus /> New Bill (POS)
            </Link>
          </div>
        }
      />
      <UdhaarClient initial={initial} />
    </div>
  );
}
