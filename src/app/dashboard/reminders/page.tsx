import { PageHeader } from "@/app/components/ui";
import { getReminders } from "@/app/actions/reminders";
import { db, schema } from "@/server/db";
import { eq } from "drizzle-orm";
import { requirePagePermission } from "@/server/rbac";
import { RemindersClient } from "./RemindersClient";
import Link from "next/link";
import { Settings } from "lucide-react";

export const metadata = {
  title: "Patient Reminders — MediFlow",
};

export default async function RemindersPage() {
  const ctx = await requirePagePermission("customer.manage");

  const [reminders, medicines] = await Promise.all([
    getReminders(),
    db
      .select({ id: schema.medicines.id, name: schema.medicines.name })
      .from(schema.medicines)
      .where(eq(schema.medicines.tenantId, ctx.tenantId))
      .limit(200),
  ]);

  return (
    <div className="page space-y-6">
      <PageHeader
        title="Patient Reminders & Refills"
        description="Automated prescription course refills, payment balance alerts, and chronic therapy follow-ups."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/settings/sms" className="btn btn-secondary btn-sm">
              <Settings className="h-4 w-4" /> SMS Gateway
            </Link>
            <Link href="/dashboard/settings/whatsapp" className="btn btn-secondary btn-sm">
              <Settings className="h-4 w-4" /> WhatsApp API
            </Link>
          </div>
        }
      />

      <RemindersClient initialReminders={reminders} medicines={medicines} />
    </div>
  );
}
