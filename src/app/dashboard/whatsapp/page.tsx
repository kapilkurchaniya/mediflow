import { PageHeader } from "@/app/components/ui";
import { getWhatsAppMessages } from "@/app/actions/whatsapp";
import { WhatsAppInboxClient } from "./WhatsAppInboxClient";
import Link from "next/link";
import { LayoutTemplate, Settings } from "lucide-react";

export const metadata = {
  title: "WhatsApp Inbox — MediFlow",
};

export default async function WhatsAppInboxPage() {
  const { messages, conversations } = await getWhatsAppMessages();

  return (
    <div className="page space-y-6">
      <PageHeader
        title="WhatsApp Inbox"
        description="Two-way patient conversations, digital invoices, refill reminders, and delivery confirmations."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/dashboard/whatsapp/templates" className="btn btn-secondary btn-sm">
              <LayoutTemplate className="h-4 w-4" /> Templates
            </Link>
            <Link href="/dashboard/settings/whatsapp" className="btn btn-secondary btn-sm">
              <Settings className="h-4 w-4" /> API Settings
            </Link>
          </div>
        }
      />

      <WhatsAppInboxClient
        initialConversations={conversations}
        initialMessages={messages}
      />
    </div>
  );
}
