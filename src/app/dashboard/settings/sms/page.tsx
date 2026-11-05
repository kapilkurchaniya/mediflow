import { PageHeader } from "@/app/components/ui";
import { getSmsConfig } from "@/app/actions/sms";
import { getSmsTemplatesAction } from "@/app/actions/sms-templates";
import { SmsSettingsClient } from "./SmsSettingsClient";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "SMS Gateway & DLT Compliance — MediFlow",
};

export default async function SmsSettingsPage() {
  await requirePagePermission("settings.manage");
  const [config, templates] = await Promise.all([
    getSmsConfig(),
    getSmsTemplatesAction(),
  ]);

  return (
    <div className="page space-y-6">
      <PageHeader
        backHref="/dashboard/reminders"
        title="SMS Gateway & TRAI DLT Compliance"
        description="Configure MSG91, TextLocal, or Twilio SMS gateway and manage approved telecom DLT content templates."
      />

      <SmsSettingsClient initialConfig={config} initialTemplates={templates} />
    </div>
  );
}
