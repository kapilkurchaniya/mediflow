import { getPurchases } from "@/app/actions/purchases";
import { getPurchaseForReturn } from "@/app/actions/purchase-returns";
import { NewReturnClient } from "./NewReturnClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{ purchaseId?: string }>;
}

export default async function NewPurchaseReturnPage(props: PageProps) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const purchaseId = searchParams.purchaseId ?? null;

  const purchasesData = await getPurchases();

  const purchaseOptions = purchasesData.map((p) => ({
    id: p.purchase.id,
    purchaseNo: p.purchase.purchaseNo,
    supplierInvoiceNo: p.purchase.supplierInvoiceNo,
    invoiceDate: p.purchase.invoiceDate,
    supplierName: p.supplier.name,
  }));

  let initialPurchaseData = null;
  if (purchaseId) {
    initialPurchaseData = await getPurchaseForReturn(purchaseId);
  }

  return (
    <NewReturnClient
      initialPurchases={purchaseOptions}
      preselectedPurchaseId={purchaseId}
      initialPurchaseData={initialPurchaseData}
    />
  );
}

