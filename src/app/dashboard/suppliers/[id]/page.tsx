import { notFound } from "next/navigation";
import { getSupplierLedgerAction } from "@/app/actions/suppliers";
import { SupplierDetailClient } from "./SupplierDetailClient";
import type { SupplierLedgerSummary } from "@/server/domain/suppliers";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ startDate?: string; endDate?: string }>;
}

export default async function SupplierDetailPage(props: PageProps) {
  const { id } = await props.params;
  const searchParams = props.searchParams ? await props.searchParams : {};

  let summary: SupplierLedgerSummary | null = null;
  try {
    summary = await getSupplierLedgerAction(id, {
      startDate: searchParams.startDate,
      endDate: searchParams.endDate,
    });
  } catch {
    notFound();
  }

  if (!summary) {
    notFound();
  }

  return <SupplierDetailClient summary={summary} />;
}
