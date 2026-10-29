import { notFound } from "next/navigation";
import { getSupplierLedgerAction, getOpenSupplierInvoicesAction } from "@/app/actions/suppliers";
import { SupplierPaymentClient } from "./SupplierPaymentClient";
import type { SupplierLedgerSummary } from "@/server/domain/suppliers";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SupplierPayPage(props: PageProps) {
  const { id } = await props.params;

  let summary: SupplierLedgerSummary | null = null;
  let openInvoices: Awaited<ReturnType<typeof getOpenSupplierInvoicesAction>> = [];

  try {
    const [summaryRes, invoicesRes] = await Promise.all([
      getSupplierLedgerAction(id),
      getOpenSupplierInvoicesAction(id),
    ]);
    summary = summaryRes;
    openInvoices = invoicesRes;
  } catch {
    notFound();
  }

  if (!summary) {
    notFound();
  }

  return (
    <SupplierPaymentClient
      supplier={{
        id: summary.supplier.id,
        name: summary.supplier.name,
        gstin: summary.supplier.gstin,
        closingBalance: summary.closingBalance,
      }}
      openInvoices={openInvoices}
    />
  );
}
