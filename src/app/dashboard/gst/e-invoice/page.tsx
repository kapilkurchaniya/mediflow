import { PageHeader } from "@/app/components/ui";
import { getEInvoicesList } from "@/app/actions/gst";
import { EInvoiceClient } from "./EInvoiceClient";

export const dynamic = "force-dynamic";

export default async function EInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const resolved = await searchParams;
  const invoices = await getEInvoicesList({ status: resolved.status });

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/gst"
        eyebrow="NIC IRP Integration"
        title="E-Invoice & E-Way Bill Hub"
        description="Generate 64-character Invoice Reference Numbers (IRN), QR codes, and E-Way Bills directly for B2B supply invoices."
      />

      <EInvoiceClient invoices={invoices} />
    </div>
  );
}
