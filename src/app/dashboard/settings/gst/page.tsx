import { PageHeader } from "@/app/components/ui";
import { requirePagePermission } from "@/server/rbac";
import { getGspSettingsAction } from "@/app/actions/gst";
import { getEInvoiceMode } from "@/server/domain/einvoice-types";
import { GspSettingsClient } from "./GspSettingsClient";

export const dynamic = "force-dynamic";

export default async function GspSettingsPage() {
  await requirePagePermission("store.manage");
  const creds = await getGspSettingsAction();
  const currentMode = getEInvoiceMode();

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/dashboard/settings"
        eyebrow="Tax & Compliance Integrations"
        title="GSP & E-Invoice Integration"
        description="Configure your GST Suvidha Provider (GSP) and NIC IRP API credentials for automated B2B e-invoicing and e-way bill generation."
      />

      <GspSettingsClient existingCreds={creds} currentMode={currentMode} />
    </div>
  );
}

