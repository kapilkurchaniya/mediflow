import { notFound } from "next/navigation";
import { getPurchaseReturn } from "@/app/actions/purchase-returns";
import { ReturnDetailClient } from "./ReturnDetailClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PurchaseReturnDetailPage(props: PageProps) {
  const { id } = await props.params;
  const returnRecord = await getPurchaseReturn(id);

  if (!returnRecord) {
    notFound();
  }

  return <ReturnDetailClient returnRecord={returnRecord} />;
}

