import { PageHeader } from "@/app/components/ui";
import { getCustomerPrivacyDetailsAction } from "@/app/actions/privacy";
import { CustomerPrivacyClient } from "./CustomerPrivacyClient";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "Patient Privacy & Consent Console (DPDP) — MediFlow",
};

export default async function CustomerPrivacyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePagePermission("customer.view");
  const { id } = await params;
  const result = await getCustomerPrivacyDetailsAction(id);

  if ("error" in result || !result.customer) {
    notFound();
  }

  return (
    <div className="page space-y-6 max-w-5xl">
      <PageHeader
        backHref="/dashboard/customers"
        title={`${result.customer.name} — Data Privacy & Consent`}
        description="Manage patient consent, export personal data archives, or exercise statutory erasure under DPDP Act 2023."
      />

      <CustomerPrivacyClient
        customer={result.customer}
        initialConsents={result.consents}
      />
    </div>
  );
}

