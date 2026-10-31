import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/app/components/ui";
import { requirePagePermission, can } from "@/server/rbac";
import { db } from "@/server/db";
import { getReturnableSaleDetails } from "@/server/domain/sales/return-sale";
import { ReturnForm } from "./ReturnForm";

export const metadata = { title: "Sale Return & Credit Note" };

export default async function SaleReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePagePermission("sale.return");
  const { id } = await params;

  let data;
  try {
    data = await getReturnableSaleDetails(db, ctx, id);
  } catch (err: unknown) {
    return notFound();
  }

  const { sale, items } = data;

  if (sale.status === "cancelled") {
    redirect(`/dashboard/sales/${id}`);
  }

  const totalReturnableUnits = items.reduce((sum, item) => sum + item.availableBaseQty, 0);

  return (
    <div className="page space-y-6">
      <PageHeader
        title={`Return Items · ${sale.invoiceNo}`}
        description="Select returned medicines and quantities to restore stock and issue a GST Credit Note"
        backHref={`/dashboard/sales/${sale.id}`}
      />

      {totalReturnableUnits <= 0 ? (
        <div className="card p-8 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            ✓
          </div>
          <h3 className="text-base font-bold text-ink-900">All Items Have Been Returned</h3>
          <p className="text-sm text-ink-500 max-w-md mx-auto">
            Every line item on Invoice {sale.invoiceNo} has already been returned in full. No additional returnable quantities remain.
          </p>
          <div className="pt-2">
            <a href={`/dashboard/sales/${sale.id}`} className="btn btn-secondary text-sm">
              Back to Invoice Details
            </a>
          </div>
        </div>
      ) : (
        <ReturnForm data={data} />
      )}
    </div>
  );
}
