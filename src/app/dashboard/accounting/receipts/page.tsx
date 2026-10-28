import { PageHeader } from "@/app/components/ui";
import { getCustomersWithDue, getRecentReceipts } from "@/app/actions/payments";
import { requirePagePermission } from "@/server/rbac";
import { ReceiptsClient } from "./ReceiptsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receipts | MediFlow Accounting" };

export default async function ReceiptsPage() {
  await requirePagePermission("accounting.post");
  const [customers, recent] = await Promise.all([getCustomersWithDue(), getRecentReceipts()]);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/accounting"
        eyebrow="Money in"
        title="Receipts"
        description="Record money received from a customer against their unpaid bills. The books, the bill balances and the outstanding report all update together."
      />
      <ReceiptsClient customers={customers} recent={recent} />
    </div>
  );
}
