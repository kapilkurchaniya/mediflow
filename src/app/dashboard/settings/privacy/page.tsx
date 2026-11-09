import { PageHeader } from "@/app/components/ui";
import { getPrivacyNoticeAction } from "@/app/actions/privacy";
import { PrivacySettingsClient } from "./PrivacySettingsClient";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "DPDP Privacy Notice & Compliance — MediFlow",
};

export default async function PrivacySettingsPage() {
  await requirePagePermission("settings.manage");
  const notice = await getPrivacyNoticeAction();

  return (
    <div className="page space-y-6 max-w-4xl">
      <PageHeader
        backHref="/dashboard/settings"
        title="Patient Privacy Notice & DPDP Compliance"
        description="Configure your pharmacy's statutory data protection notice, Data Protection Officer contact, and retention schedule."
      />

      <PrivacySettingsClient initialNotice={notice} />
    </div>
  );
}

