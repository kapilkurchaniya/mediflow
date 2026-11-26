import { requirePagePermission } from "@/server/rbac";
import { PageHeader } from "@/app/components/ui";
import { getVoucherFormDataAction } from "@/app/actions/accounting-vouchers";
import { VouchersClient } from "./VouchersClient";

export const metadata = {
  title: "Manual Vouchers, Contra & Notes | MediFlow Accounting",
};

export default async function AccountingVouchersPage() {
  await requirePagePermission("accounting.post");
  const data = await getVoucherFormDataAction();

  return (
    <div className="page space-y-6">
      <PageHeader
        eyebrow="Double-Entry Vouchers"
        title="Journal, Contra & Debit/Credit Notes"
        description="Post manual journal adjustments, cash-to-bank contra transfers, and standalone financial debit/credit notes."
      />
      <VouchersClient
        accounts={data.accounts}
        customers={data.customers}
        suppliers={data.suppliers}
        recentVouchers={data.recentVouchers}
      />
    </div>
  );
}
