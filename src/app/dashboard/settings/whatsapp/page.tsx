import { PageHeader } from "@/app/components/ui";
import { getWhatsAppConfig } from "@/app/actions/whatsapp";
import { WhatsAppSettingsClient } from "./WhatsAppSettingsClient";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "WhatsApp API Settings — MediFlow",
};

export default async function WhatsAppSettingsPage() {
  await requirePagePermission("settings.manage");
  const config = await getWhatsAppConfig();

  return (
    <div className="page space-y-6">
      <PageHeader
        backHref="/dashboard/whatsapp"
        title="WhatsApp Business API Settings"
        description="Connect your Meta Cloud API to automatically send bills, prescription refill reminders, and ledger statements directly to patients."
      />

      <WhatsAppSettingsClient initialConfig={config} />
    </div>
  );
}
