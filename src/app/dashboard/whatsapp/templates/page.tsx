import { PageHeader } from "@/app/components/ui";
import { getWhatsAppTemplates } from "@/app/actions/whatsapp";
import { TemplatesClient } from "./TemplatesClient";
import { requirePagePermission } from "@/server/rbac";

export const metadata = {
  title: "WhatsApp Templates — MediFlow",
};

export default async function WhatsAppTemplatesPage() {
  await requirePagePermission("settings.manage");
  const templates = await getWhatsAppTemplates();

  // If none yet, provide standard default templates
  const displayTemplates =
    templates.length > 0
      ? templates
      : [
          {
            id: "default-1",
            name: "invoice_receipt_v1",
            category: "UTILITY",
            languageCode: "en",
            header: "MediFlow Tax Invoice",
            body: "Dear {{1}},\n\nYour tax invoice #{{2}} for ₹{{3}} has been generated. Thank you for shopping with MediFlow Pharmacy!\n\nView bill: {{4}}",
            footer: "Wishing you good health!",
            status: "approved",
          },
          {
            id: "default-2",
            name: "refill_reminder_v1",
            category: "UTILITY",
            languageCode: "en",
            header: "Prescription Refill Reminder",
            body: "Dear {{1}},\n\nYour course of {{2}} is due for refill on {{3}}. Reply YES to reserve your strip for pickup or home delivery.",
            footer: "MediFlow Care Team",
            status: "approved",
          },
          {
            id: "default-3",
            name: "payment_due_alert",
            category: "UTILITY",
            languageCode: "en",
            header: "Ledger Balance Due",
            body: "Dear {{1}},\n\nYour current credit balance of ₹{{2}} is due for settlement. Kindly pay via UPI or at the pharmacy counter.",
            footer: "Accounts Dept, MediFlow",
            status: "approved",
          },
        ];

  return (
    <div className="page space-y-6">
      <PageHeader
        backHref="/dashboard/whatsapp"
        title="Message Templates"
        description="Pre-approved Meta WhatsApp Business templates for billing, refill cycles, and statutory notifications."
      />

      <TemplatesClient initialTemplates={displayTemplates} />
    </div>
  );
}
