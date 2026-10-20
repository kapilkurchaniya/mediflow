import { PageHeader } from "@/app/components/ui";
import { getSmsConfig } from "@/app/actions/sms";
import { SmsSettingsClient } from "./SmsSettingsClient";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "SMS Gateway Settings — MediFlow",
};

export default async function SmsSettingsPage() {
  await requirePagePermission("settings.manage");
  const config = await getSmsConfig();

  return (
    <div className="page space-y-6">
      <PageHeader
        backHref="/dashboard/reminders"
        title="SMS Gateway Configuration"
        description="Configure MSG91, TextLocal, or Twilio SMS gateway for automated patient alerts and DLT compliance."
      />

      <SmsSettingsClient initialConfig={config} />
    </div>
  );
}
